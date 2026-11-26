import { jobStations, prologueFrames, roomNames } from '../game/stage5-contract';
import type { Stage5Command } from '../game/stage5-contract';
import { applyCommand, capacityLimit, economyFor, jewelryLimit, migrateStage4, openCargoItems, stage6Defaults, storageUsage, transportBlock, transportLoad, vehicleFor } from '../game/stage5-engine';
import { transportModels } from '../game/transport';
import type { TransportState } from '../game/transport';
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
  const limit = value.price;
  const validOffer = (offer: unknown): boolean => isRecord(offer) && typeof offer.id === 'string' && typeof offer.buyer === 'string' &&
    isMoney(offer.price) && offer.price > 0 && offer.price <= limit && typeof offer.unread === 'boolean' &&
    (offer.delivery === undefined || typeof offer.delivery === 'boolean' && (!offer.delivery || offer.price === limit)) &&
    (offer.countered === undefined || typeof offer.countered === 'boolean') &&
    (offer.closed === undefined || typeof offer.closed === 'boolean') &&
    (offer.ceiling === undefined || isMoney(offer.ceiling) && offer.ceiling >= offer.price && offer.ceiling <= limit) &&
    (offer.messages === undefined || Array.isArray(offer.messages) && offer.messages.length <= 20 && offer.messages.every(message =>
      isRecord(message) && (message.side === 'player' || message.side === 'buyer') &&
      typeof message.text === 'string' && message.text.length <= 300));
  if (offer !== null && !validOffer(offer)) return false;
  const others = value.otherOffers;
  if (others === undefined) return true;
  if (!offer || !Array.isArray(others) || others.length > 2 || !others.every(validOffer)) return false;
  const all = [offer, ...others];
  return new Set(all.map(thread => thread.id)).size === all.length &&
    new Set(all.map(thread => thread.buyer)).size === all.length;
}

function isTransport(value: unknown): value is TransportState {
  if (!isRecord(value) || !transportModels.some(model => model === value.model)) return false;
  return value.model === 'heavy'
    ? exactKeys(value, ['model', 'engine', 'trailer']) &&
      [0, 1, 2].some(level => level === value.engine) && [0, 1, 2].some(level => level === value.trailer)
    : exactKeys(value, ['model']);
}

export function isStage5State(value: unknown, boxed: readonly OwnedItem[] = [], lastAuctionNumber?: number): value is Stage5State {
  if (!isRecord(value) || !exactKeys(value, [
    'base', 'opening', 'room', 'legacyLot', 'items', 'cargo', 'listings', 'deals', 'lastSale', 'lastDeal', 'job', 'jobIncorrect',
    'lotEdition', 'capacityUpgrades', 'baggageArrived', ...(Object.hasOwn(value, 'reviews') ? ['reviews'] : []),
    ...(Object.hasOwn(value, 'transport') ? ['transport'] : []),
    ...(Object.hasOwn(value, 'workshop') ? ['workshop'] : []),
    ...(Object.hasOwn(value, 'house') ? ['house'] : []),
  ])) return false;
  const reviews = value.reviews;
  if (reviews !== undefined && (!Array.isArray(reviews) || reviews.length > 100 || !reviews.every(review =>
    isRecord(review) && typeof review.buyer === 'string' && typeof review.item === 'string' &&
    typeof review.text === 'string' && [1, 2, 3, 4, 5].some(stars => stars === review.stars)))) return false;
  const { base, opening, room, legacyLot, items, cargo, listings, deals, lastSale, lastDeal, job, jobIncorrect,
    lotEdition, capacityUpgrades, baggageArrived, transport } = value;
  if (typeof legacyLot !== 'boolean' || (lotEdition !== 5 && lotEdition !== 6 && lotEdition !== 7) ||
      typeof baggageArrived !== 'boolean' || !areIds(capacityUpgrades, ['garage', 'car', 'shelves']) ||
      (transport !== undefined && !isTransport(transport)) ||
      !isStage4State(base, economyFor({ legacyLot, lotEdition }), true)) return false;
  const game = base.game;
  if (game.phase === 'prologue') return false;
  if (value.workshop !== undefined && (value.workshop !== true || !game.assets.includes('home'))) return false;
  if (value.house !== undefined && (value.workshop !== true || (value.house !== 4 && value.house !== 5))) return false;
  if (capacityUpgrades.includes('shelves') && !capacityUpgrades.includes('garage')) return false;
  const latestLot = lastAuctionNumber ?? game.lotNumber;
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
      (deal.baggageId === undefined ? isMoney(deal.lotNumber) && deal.lotNumber <= latestLot
        : typeof deal.baggageId === 'string' && deal.lotNumber === null) &&
      owned.some((item) => belongs(item, deal)))) return false;
  if (new Set(deals.map(({ lotNumber, baggageId }) => baggageId ?? lotNumber)).size !== deals.length ||
      !owned.every((item) => item.lotNumber === null && item.baggageId === undefined || deals.some((deal) => belongs(item, deal)))) return false;
  if (lastSale !== null && (!isRecord(lastSale) || typeof lastSale.name !== 'string' || !isMoney(lastSale.price))) return false;
  if (lastDeal !== null) {
    if (!isRecord(lastDeal) ||
        (lastDeal.lotNumber !== null && (!isMoney(lastDeal.lotNumber) || lastDeal.lotNumber > latestLot)) ||
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
  const vehicle = { ...(transport ? { transport } : {}), capacityUpgrades };
  const shippable = game.phase !== 'reveal' ||
    (transportLoad(vehicle, game, selected) <= vehicleFor(vehicle).capacity &&
      selected.every(item => !transportBlock(vehicle, game, item, 0)));
  return shippable &&
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
