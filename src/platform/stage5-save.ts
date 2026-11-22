import { jobStations, prologueFrames, roomNames } from '../game/stage5-contract';
import type { Stage5Command } from '../game/stage5-contract';
import { applyCommand, carLimit, findSize, garageLimit, migrateStage4 } from '../game/stage5-engine';
import type { OwnedItem, Stage5State } from '../game/stage5-engine';
import { migratedEconomy, rubleEconomy } from '../game/stage5-economy';
import { areIds, exactKeys, isMoney, isRecord, loadSnapshot, writeSnapshot } from './save';
import type { LoadResult, SavedCommandResult, SaveResult, SaveStorage } from './save';
import { decodeStage4, isStage4State } from './stage4-save';

const version = 4;

function isOwned(value: unknown): value is OwnedItem {
  if (!isRecord(value)) return false;
  const { id, name, size, condition, position, clue, estimate, lotNumber, value: price } = value;
  return typeof id === 'string' && typeof name === 'string' && typeof clue === 'string' &&
    (size === 1 || size === 2 || size === 4) && (position === 'floor' || position === 'shelf') &&
    (condition === 'good' || condition === 'worn' || condition === 'damaged') &&
    isRecord(estimate) && isMoney(estimate.min) && isMoney(estimate.max) && isMoney(price) &&
    estimate.min <= price && price <= estimate.max && (lotNumber === null || isMoney(lotNumber));
}

function validListing(value: unknown, items: readonly OwnedItem[]) {
  if (!isRecord(value) || typeof value.id !== 'string' || !items.some(({ id }) => id === value.itemId) ||
      !isMoney(value.price) || value.price === 0) return false;
  const offer = value.offer;
  return offer === null || isRecord(offer) && typeof offer.id === 'string' && typeof offer.buyer === 'string' &&
    isMoney(offer.price) && offer.price > 0 && offer.price <= value.price && typeof offer.unread === 'boolean';
}

function isStage5State(value: unknown): value is Stage5State {
  if (!isRecord(value) || !exactKeys(value, [
    'base', 'opening', 'room', 'legacyLot', 'items', 'cargo', 'listings', 'deals', 'lastSale', 'lastDeal', 'job', 'jobIncorrect',
  ])) return false;
  const { base, opening, room, legacyLot, items, cargo, listings, deals, lastSale, lastDeal, job, jobIncorrect } = value;
  if (typeof legacyLot !== 'boolean' || !isStage4State(base, legacyLot ? migratedEconomy : rubleEconomy, true)) return false;
  const game = base.game;
  if (game.phase === 'prologue') return false;
  if (opening !== null && (!prologueFrames.some((frame) => frame === opening) || game.lotNumber !== 0 || room !== null)) return false;
  if (room !== null && (!roomNames.some((name) => name === room) || game.phase !== 'hub' || base.relationshipOpen)) return false;
  if (!Array.isArray(items) || !items.every(isOwned)) return false;
  const occupied = items.reduce((sum, item) => sum + item.size, 0);
  if (new Set(items.map(({ id }) => id)).size !== items.length || occupied > garageLimit) return false;
  if (opening !== null && (items.length > 0 || game.bank > 0)) return false;
  if (!Array.isArray(listings) || !listings.every((listing) => validListing(listing, items)) ||
      new Set(listings.map(({ itemId }) => itemId)).size !== listings.length ||
      new Set(listings.map(({ id }) => id)).size !== listings.length) return false;
  if (!Array.isArray(deals) || !deals.every((deal) => isRecord(deal) && isMoney(deal.cost) &&
      isMoney(deal.revenue) && isMoney(deal.lotNumber) && deal.lotNumber <= game.lotNumber &&
      items.some(({ lotNumber }) => lotNumber === deal.lotNumber))) return false;
  if (new Set(deals.map(({ lotNumber }) => lotNumber)).size !== deals.length ||
      !items.every(({ lotNumber }) => lotNumber === null || deals.some((deal) => deal.lotNumber === lotNumber))) return false;
  if (lastSale !== null && (!isRecord(lastSale) || typeof lastSale.name !== 'string' || !isMoney(lastSale.price))) return false;
  if (lastDeal !== null) {
    if (!isRecord(lastDeal) || !isMoney(lastDeal.lotNumber) || lastDeal.lotNumber > game.lotNumber) return false;
    const receipt = lastDeal.receipt;
    if (!isRecord(receipt) || receipt.outcome !== 'sold' || !isMoney(receipt.revenue) ||
        !isMoney(receipt.purchasePrice) || receipt.profit !== receipt.revenue - receipt.purchasePrice) return false;
  }
  if (!isMoney(job) || job > jobStations.length || typeof jobIncorrect !== 'boolean' ||
      (game.phase !== 'recovery' && (job !== 0 || jobIncorrect))) return false;
  const available = game.phase === 'reveal' ? [
    ...game.lot.visibleFinds,
    ...game.lot.boxes.filter(({ id }) => game.openedBoxIds.includes(id)).flatMap(({ contents }) => contents),
  ].filter(({ id }) => !game.soldItemIds.includes(id)) : [];
  if (!areIds(cargo, available.map(({ id }) => id))) return false;
  const reserved = available.reduce((sum, item) => sum + (cargo.includes(item.id) ? findSize(item) : 0), 0);
  return reserved <= carLimit && occupied + reserved <= garageLimit;
}

function decode(serialized: string | null): Stage5State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value)) return null;
    if (value.version === version) return isStage5State(value.state) ? value.state : null;
    const old = decodeStage4(serialized);
    if (!old) return null;
    const migrated = migrateStage4(old);
    return isStage5State(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult<Stage5State> {
  return loadSnapshot(storage, decode);
}

export function save(storage: SaveStorage, state: Stage5State): SaveResult {
  return writeSnapshot(storage, { version, state }, decode);
}

export function applySavedCommand(storage: SaveStorage, state: Stage5State, command: Stage5Command): SavedCommandResult<Stage5State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
