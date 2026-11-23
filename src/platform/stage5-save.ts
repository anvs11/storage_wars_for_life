import { jobStations, prologueFrames, roomNames } from '../game/stage5-contract';
import type { Stage5Command } from '../game/stage5-contract';
import { applyCommand, capacityLimit, economyFor, jewelryLimit, migrateStage4, openCargoItems, stage6Defaults, storageUsage } from '../game/stage5-engine';
import type { OwnedItem, Stage5State } from '../game/stage5-engine';
import { areIds, exactKeys, isMoney, isRecord, loadSnapshot, writeSnapshot } from './save';
import type { LoadResult, SavedCommandResult, SaveResult, SaveStorage } from './save';
import { decodeStage4, isStage4State } from './stage4-save';

const version = 5;

export function isOwned(value: unknown): value is OwnedItem {
  if (!isRecord(value)) return false;
  const { id, name, size, condition, position, clue, estimate, lotNumber, value: price } = value;
  return typeof id === 'string' && typeof name === 'string' && typeof clue === 'string' &&
    (size === 1 || size === 2 || size === 4) && (position === 'floor' || position === 'shelf' || position === 'jewelryBox') &&
    (condition === 'good' || condition === 'worn' || condition === 'damaged') &&
    isRecord(estimate) && isMoney(estimate.min) && isMoney(estimate.max) && isMoney(price) &&
    estimate.min <= price && price <= estimate.max && (lotNumber === null || isMoney(lotNumber)) &&
    (value.baggageId === undefined || typeof value.baggageId === 'string' && lotNumber === null);
}

function validListing(value: unknown, items: readonly OwnedItem[]) {
  if (!isRecord(value) || typeof value.id !== 'string' || !items.some(({ id }) => id === value.itemId) ||
      !isMoney(value.price) || value.price === 0) return false;
  const offer = value.offer;
  return offer === null || isRecord(offer) && typeof offer.id === 'string' && typeof offer.buyer === 'string' &&
    isMoney(offer.price) && offer.price > 0 && offer.price <= value.price && typeof offer.unread === 'boolean' &&
    (offer.delivery === undefined || typeof offer.delivery === 'boolean' && (!offer.delivery || offer.price === value.price)) &&
    (offer.countered === undefined || typeof offer.countered === 'boolean');
}

export function isStage5State(value: unknown, boxed: readonly OwnedItem[] = []): value is Stage5State {
  if (!isRecord(value) || !exactKeys(value, [
    'base', 'opening', 'room', 'legacyLot', 'items', 'cargo', 'listings', 'deals', 'lastSale', 'lastDeal', 'job', 'jobIncorrect',
    'lotEdition', 'capacityUpgrades', 'baggageArrived',
  ])) return false;
  const { base, opening, room, legacyLot, items, cargo, listings, deals, lastSale, lastDeal, job, jobIncorrect,
    lotEdition, capacityUpgrades, baggageArrived } = value;
  if (typeof legacyLot !== 'boolean' || (lotEdition !== 5 && lotEdition !== 6) ||
      typeof baggageArrived !== 'boolean' || !areIds(capacityUpgrades, ['garage', 'car']) ||
      !isStage4State(base, economyFor({ legacyLot, lotEdition }), true)) return false;
  const game = base.game;
  if (game.phase === 'prologue') return false;
  if (baggageArrived && game.phase !== 'baggageInventory') return false;
  if (opening !== null && (!prologueFrames.some((frame) => frame === opening) || game.lotNumber !== 0 || room !== null)) return false;
  if (room !== null && (!roomNames.some((name) => name === room) || game.phase !== 'hub' || base.relationshipOpen)) return false;
  if (!Array.isArray(items) || !items.every(isOwned)) return false;
  const owned = [...items, ...boxed];
  if (new Set(owned.map(({ id }) => id)).size !== owned.length) return false;
  if (opening !== null && (owned.length > 0 || game.bank > 0)) return false;
  if (!Array.isArray(listings) || !listings.every((listing) => validListing(listing, items)) ||
      new Set(listings.map(({ itemId }) => itemId)).size !== listings.length ||
      new Set(listings.map(({ id }) => id)).size !== listings.length) return false;
  const belongs = (item: OwnedItem, deal: Record<string, unknown>): boolean =>
    deal.baggageId === undefined ? item.lotNumber === deal.lotNumber && item.lotNumber !== null : item.baggageId === deal.baggageId;
  if (!Array.isArray(deals) || !deals.every((deal) => isRecord(deal) && isMoney(deal.cost) &&
      isMoney(deal.revenue) && (deal.repairCost === undefined || isMoney(deal.repairCost)) &&
      (deal.baggageId === undefined ? isMoney(deal.lotNumber) && deal.lotNumber <= game.lotNumber
        : typeof deal.baggageId === 'string' && deal.lotNumber === null) &&
      owned.some((item) => belongs(item, deal)))) return false;
  if (new Set(deals.map(({ lotNumber, baggageId }) => baggageId ?? lotNumber)).size !== deals.length ||
      !owned.every((item) => item.lotNumber === null && item.baggageId === undefined || deals.some((deal) => belongs(item, deal)))) return false;
  if (lastSale !== null && (!isRecord(lastSale) || typeof lastSale.name !== 'string' || !isMoney(lastSale.price))) return false;
  if (lastDeal !== null) {
    if (!isRecord(lastDeal) ||
        (lastDeal.lotNumber !== null && (!isMoney(lastDeal.lotNumber) || lastDeal.lotNumber > game.lotNumber)) ||
        (lastDeal.repairCost !== undefined && !isMoney(lastDeal.repairCost))) return false;
    const receipt = lastDeal.receipt;
    if (!isRecord(receipt) || receipt.outcome !== 'sold' || !isMoney(receipt.revenue) ||
        !isMoney(receipt.purchasePrice) || receipt.profit !== receipt.revenue - receipt.purchasePrice) return false;
    if (typeof lastDeal.repairCost === 'number' && lastDeal.repairCost > receipt.purchasePrice) return false;
  }
  if (!isMoney(job) || job > jobStations.length || typeof jobIncorrect !== 'boolean' ||
      (game.phase !== 'recovery' && (job !== 0 || jobIncorrect))) return false;
  const available = game.phase === 'reveal' || game.phase === 'baggageInventory' && baggageArrived ? openCargoItems(game) : [];
  if (!areIds(cargo, available.map(({ id }) => id))) return false;
  const selected = available.filter(({ id }) => cargo.includes(id));
  const stored = [...items, ...selected];
  return (game.phase !== 'reveal' || selected.reduce((sum, item) => sum + item.size, 0) <= capacityLimit(capacityUpgrades, 'car')) &&
    storageUsage(stored, false) <= capacityLimit(capacityUpgrades, 'garage') &&
    storageUsage(stored, true) <= jewelryLimit;
}

export function decodeStage5(serialized: string | null): Stage5State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value)) return null;
    if (value.version === version) return isStage5State(value.state) ? value.state : null;
    if (value.version === 4 && isRecord(value.state)) {
      const base = value.state.base;
      const migrated = {
        ...value.state, ...stage6Defaults, lotEdition: 5,
        baggageArrived: isRecord(base) && isRecord(base.game) && base.game.phase === 'baggageInventory',
      };
      return isStage5State(migrated) ? migrated : null;
    }
    const old = decodeStage4(serialized);
    if (!old) return null;
    const migrated = migrateStage4(old);
    return isStage5State(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult<Stage5State> {
  return loadSnapshot(storage, decodeStage5);
}

export function save(storage: SaveStorage, state: Stage5State): SaveResult {
  return writeSnapshot(storage, { version, state }, decodeStage5);
}

export function applySavedCommand(storage: SaveStorage, state: Stage5State, command: Stage5Command): SavedCommandResult<Stage5State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
