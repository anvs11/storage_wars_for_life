import { createLot } from '../game/catalog';
import type { GarageLot } from '../game/catalog';
import type { Stage2Command } from '../game/stage2-contract';
import { applyCommand } from '../game/stage2-engine';
import type { Stage2State } from '../game/stage2-engine';

export const SAVE_KEY = 'storage-wars.stage2';
export const BACKUP_KEY = 'storage-wars.stage2.backup';
const version = 1;

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type LoadResult =
  | { kind: 'new' }
  | { kind: 'loaded'; state: Stage2State }
  | { kind: 'recovered'; state: Stage2State; message: string }
  | { kind: 'damaged' | 'unavailable'; message: string };

export type SaveResult = { ok: true } | { ok: false; message: string };

const profileKeys = ['phase', 'revision', 'bank', 'status'];
const lotKeys = [...profileKeys, 'lotNumber', 'lot', 'inspectedItemIds', 'activeOpponentIds'];
const inventoryKeys = [...lotKeys, 'openedBoxIds', 'soldItemIds'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

function matches(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(value) && value.length === expected.length &&
      expected.every((entry, index) => matches(value[index], entry));
  }
  if (isRecord(expected)) {
    return isRecord(value) && exactKeys(value, Object.keys(expected)) &&
      Object.entries(expected).every(([key, entry]) => matches(value[key], entry));
  }
  return value === expected;
}

function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function areIds(value: unknown, allowed: readonly string[]): value is readonly string[] {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && allowed.includes(id));
}

function isBid(value: unknown, lot: GarageLot): value is number {
  return isMoney(value) && value >= lot.openingBid && (value - lot.openingBid) % lot.bidIncrement === 0;
}

function getSavedInventory(state: Record<string, unknown>, lot: GarageLot) {
  const { openedBoxIds, soldItemIds } = state;
  if (!areIds(openedBoxIds, lot.boxes.map(({ id }) => id))) return null;
  const openFinds = [
    ...lot.visibleFinds,
    ...lot.boxes.filter(({ id }) => openedBoxIds.includes(id)).flatMap(({ contents }) => contents),
  ];
  if (!areIds(soldItemIds, openFinds.map(({ id }) => id))) return null;
  const revenue = openFinds.reduce((sum, { id, salePrice }) => soldItemIds.includes(id) ? sum + salePrice : sum, 0);
  const hasRemaining = openedBoxIds.length < lot.boxes.length || soldItemIds.length < openFinds.length;
  return { revenue, hasRemaining };
}

function isStage2State(value: unknown): value is Stage2State {
  if (!isRecord(value)) return false;
  const { phase, revision, bank, status } = value;
  if (!isMoney(revision) || !isMoney(bank) || !isMoney(status) || status % 2 !== 0) return false;

  if (phase === 'prologue') {
    return exactKeys(value, [...profileKeys, 'storyIndex']) &&
      value.storyIndex === revision && revision <= 8 && bank === 0 && status === 0;
  }

  const { lotNumber, inspectedItemIds, activeOpponentIds } = value;
  if (!isMoney(lotNumber) || lotNumber < 1 || lotNumber > revision) return false;
  const lot = createLot(lotNumber);
  const opponentIds = lot.opponents.map(({ id }) => id);
  if (!matches(value.lot, lot) || !areIds(inspectedItemIds, lot.visibleFinds.map(({ id }) => id)) ||
      !areIds(activeOpponentIds, opponentIds)) return false;
  const activeOpponents = lot.opponents.filter(({ id }) => activeOpponentIds.includes(id));
  if (!matches(activeOpponentIds, activeOpponents.map(({ id }) => id))) return false;

  switch (phase) {
    case 'inspection':
    case 'recovery':
      return exactKeys(value, lotKeys) && activeOpponentIds.length === opponentIds.length &&
        (phase === 'inspection' ? bank >= lot.openingBid : bank < lot.openingBid && inspectedItemIds.length === 0);
    case 'bidding': {
      const { lastPlayerBid, opponentBid, leaderId } = value;
      return exactKeys(value, [...lotKeys, 'lastPlayerBid', 'opponentBid', 'leaderId']) &&
        isBid(lastPlayerBid, lot) && lastPlayerBid <= bank && activeOpponentIds.length > 0 &&
        leaderId === activeOpponentIds.at(-1) &&
        opponentBid === lastPlayerBid + lot.bidIncrement * activeOpponentIds.length &&
        activeOpponents.every(({ limit }, index) => limit >= lastPlayerBid + lot.bidIncrement * (index + 1));
    }
    case 'reveal': {
      const inventory = getSavedInventory(value, lot);
      return exactKeys(value, [...inventoryKeys, 'purchasePrice']) && activeOpponentIds.length === 0 &&
        isBid(value.purchasePrice, lot) && inventory !== null &&
        inventory.hasRemaining && bank >= inventory.revenue;
    }
    case 'result': {
      if (!exactKeys(value, [...inventoryKeys, 'receipt']) || !isRecord(value.receipt)) return false;
      const { receipt } = value;
      if (receipt.outcome === 'passed') {
        return matches(value.openedBoxIds, []) && matches(value.soldItemIds, []) &&
          matches(receipt, { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 });
      }
      const inventory = getSavedInventory(value, lot);
      if (receipt.outcome !== 'sold' || activeOpponentIds.length !== 0 || inventory === null ||
          inventory.hasRemaining || bank < inventory.revenue || !isBid(receipt.purchasePrice, lot)) return false;
      const { purchasePrice } = receipt;
      return matches(receipt, {
        outcome: 'sold',
        purchasePrice,
        revenue: inventory.revenue,
        profit: inventory.revenue - purchasePrice,
      });
    }
    default:
      return false;
  }
}

function decode(serialized: string | null): Stage2State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    return isRecord(value) && value.version === version && isStage2State(value.state) ? value.state : null;
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult {
  try {
    const primary = storage.getItem(SAVE_KEY);
    const state = decode(primary);
    if (state) return { kind: 'loaded', state };

    const backup = storage.getItem(BACKUP_KEY);
    const restored = decode(backup);
    if (restored) {
      return { kind: 'recovered', state: restored, message: 'Восстановлено предыдущее сохранение.' };
    }
    if (primary === null && backup === null) return { kind: 'new' };
    return { kind: 'damaged', message: 'Сохранение повреждено. Можно начать новую игру.' };
  } catch {
    return { kind: 'unavailable', message: 'Сохранение недоступно. Проверьте доступ к хранилищу.' };
  }
}

export function save(storage: SaveStorage, state: Stage2State): SaveResult {
  try {
    const snapshot = JSON.stringify({ version, state });
    const previous = storage.getItem(SAVE_KEY);
    if (previous !== null && decode(previous)) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, snapshot);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Не удалось сохранить игру. Повторите действие.' };
  }
}

export type SavedCommandResult =
  | { kind: 'ignored' | 'saved'; state: Stage2State }
  | { kind: 'failed'; state: Stage2State; message: string };

export function applySavedCommand(storage: SaveStorage, state: Stage2State, command: Stage2Command): SavedCommandResult {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
