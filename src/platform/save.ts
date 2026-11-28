import { createLot } from '../game/catalog';
import type { GarageLot } from '../game/catalog';
import type { Stage2Command } from '../game/stage2-contract';
import { applyCommand, applyGarageCommand, enterLot } from '../game/stage2-engine';
import { openFinds } from '../game/inventory';
import type { InventoryContents } from '../game/inventory';
import type { Stage2State } from '../game/stage2-engine';

export const SAVE_KEY = 'storage-wars.stage2';
export const BACKUP_KEY = 'storage-wars.stage2.backup';
const version = 1;

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type LoadResult<State = Stage2State> =
  | { kind: 'new' }
  | { kind: 'loaded'; state: State }
  | { kind: 'recovered'; state: State; message: string }
  | { kind: 'damaged' | 'unavailable'; message: string };

export type SaveResult = { ok: true } | { ok: false; message: string };

const profileKeys = ['phase', 'revision', 'bank', 'status'];
const lotKeys = [...profileKeys, 'lotNumber', 'lot', 'inspectedItemIds', 'activeOpponentIds'];
const inventoryKeys = [...lotKeys, 'openedBoxIds', 'soldItemIds'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

export function matches(value: unknown, expected: unknown): boolean {
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

export function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function areIds(value: unknown, allowed: readonly string[]): value is readonly string[] {
  return Array.isArray(value) && new Set(value).size === value.length &&
    value.every((id) => typeof id === 'string' && allowed.includes(id));
}

export function getSavedInventory(state: Record<string, unknown>, contents: InventoryContents) {
  const { openedBoxIds, soldItemIds } = state;
  if (!areIds(openedBoxIds, contents.boxes.map(({ id }) => id))) return null;
  const available = openFinds(contents, openedBoxIds);
  if (!areIds(soldItemIds, available.map(({ id }) => id))) return null;
  const revenue = available.reduce((sum, { id, salePrice }) => soldItemIds.includes(id) ? sum + salePrice : sum, 0);
  const hasRemaining = openedBoxIds.length < contents.boxes.length || soldItemIds.length < available.length;
  return { revenue, hasRemaining };
}

export function isGarageSnapshot(
  value: Record<string, unknown>, lot: GarageLot<string>, advancePrice?: (price: number) => number, openBidding = false,
): boolean {
  const { phase, revision, bank, status, lotNumber, inspectedItemIds, activeOpponentIds } = value;
  if (!isMoney(revision) || !isMoney(bank) || !isMoney(status) || !isMoney(lotNumber) ||
      lotNumber < 1 || lotNumber > revision) return false;
  const opponentIds = lot.opponents.map(({ id }) => id);
  if (!matches(value.lot, lot) || !areIds(inspectedItemIds, lot.visibleFinds.map(({ id }) => id)) ||
      !areIds(activeOpponentIds, opponentIds)) return false;

  if (phase === 'inspection' || phase === 'recovery') {
    return exactKeys(value, lotKeys) && matches(activeOpponentIds, opponentIds) &&
      (phase === 'inspection' ? bank >= lot.openingBid : bank < lot.openingBid && inspectedItemIds.length === 0);
  }

  if (openBidding && phase === 'reveal' && advancePrice && isMoney(value.purchasePrice)) {
    // A player can win at the opening price or one step above an affordable NPC bid.
    const ceiling = advancePrice(Math.max(lot.openingBid, ...lot.opponents.map(opponent => opponent.limit)));
    let price = lot.openingBid;
    while (price < value.purchasePrice && price <= ceiling) price = advancePrice(price);
    const inventory = getSavedInventory(value, lot);
    return price === value.purchasePrice && price <= ceiling && activeOpponentIds.length === 0
      && exactKeys(value, [...inventoryKeys, 'purchasePrice']) && !!inventory?.hasRemaining && bank >= inventory.revenue;
  }

  // Проверяем путь ставок по тем же правилам, которыми он был принят.
  let round = enterLot({ revision: 0, bank: Number.MAX_SAFE_INTEGER, status: 0 }, lotNumber, lot);
  let passed = matches(activeOpponentIds, opponentIds);
  while (round.phase === 'inspection' || round.phase === 'bidding') {
    round = applyGarageCommand(round, { type: 'bid', expectedRevision: round.revision }, advancePrice);
    if (round.phase !== 'bidding') break;
    const sameOpponents = matches(activeOpponentIds, round.activeOpponentIds);
    if (sameOpponents && round.lastPlayerBid <= bank) {
      passed = true;
      if (phase === 'bidding' && value.lastPlayerBid === round.lastPlayerBid &&
          value.opponentBid === round.opponentBid && value.leaderId === round.leaderId) {
        return exactKeys(value, [...lotKeys, 'lastPlayerBid', 'opponentBid', 'leaderId']);
      }
    }
  }

  if (phase === 'result' && isRecord(value.receipt) && value.receipt.outcome === 'passed') {
    return exactKeys(value, [...inventoryKeys, 'receipt']) && passed &&
      matches(value.openedBoxIds, []) && matches(value.soldItemIds, []) &&
      matches(value.receipt, { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 });
  }
  if (round.phase !== 'reveal' || activeOpponentIds.length !== 0) return false;
  const inventory = getSavedInventory(value, lot);
  if (!inventory || bank < inventory.revenue) return false;
  if (phase === 'reveal') {
    return exactKeys(value, [...inventoryKeys, 'purchasePrice']) &&
      inventory.hasRemaining && value.purchasePrice === round.purchasePrice;
  }
  return phase === 'result' && !inventory.hasRemaining && exactKeys(value, [...inventoryKeys, 'receipt']) &&
    matches(value.receipt, {
      outcome: 'sold', purchasePrice: round.purchasePrice, revenue: inventory.revenue,
      profit: inventory.revenue - round.purchasePrice,
    });
}

export function isStage2State(value: unknown): value is Stage2State {
  if (!isRecord(value)) return false;
  const { phase, revision, bank, status, lotNumber } = value;
  if (!isMoney(status) || status % 2 !== 0) return false;
  if (phase === 'prologue') {
    return exactKeys(value, [...profileKeys, 'storyIndex']) &&
      isMoney(revision) && value.storyIndex === revision && revision <= 8 && bank === 0 && status === 0;
  }
  return isMoney(lotNumber) && lotNumber >= 1 && isGarageSnapshot(value, createLot(lotNumber));
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
  return loadSnapshot(storage, decode);
}

export function loadSnapshot<State>(storage: SaveStorage, decode: (serialized: string | null) => State | null): LoadResult<State> {
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
  return writeSnapshot(storage, { version, state }, decode);
}

export function writeSnapshot(
  storage: SaveStorage, snapshot: { version: number; state: unknown }, decode: (serialized: string | null) => unknown,
): SaveResult {
  try {
    const serialized = JSON.stringify(snapshot);
    const previous = storage.getItem(SAVE_KEY);
    if (previous !== null && decode(previous)) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, serialized);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Не удалось сохранить игру. Повторите действие.' };
  }
}

export type SavedCommandResult<State = Stage2State> =
  | { kind: 'ignored' | 'saved'; state: State }
  | { kind: 'failed'; state: State; message: string };

export function applySavedCommand(storage: SaveStorage, state: Stage2State, command: Stage2Command): SavedCommandResult {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
