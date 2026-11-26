import type { LotFind } from './catalog';
import type { RevealedFind, SoldReceipt } from './contract';
import { draw } from './random';
import type { Stage3HubState } from './stage3-engine';
import type { Stage4State } from './stage4-engine';
import { applyCommand as applyBase, getView as baseView, newGame as newBase } from './stage4-engine';
import { migrateLot, migrateReceipt, migratedEconomy, rubleEconomy, toRubles } from './stage5-economy';
import type { GarageItemView, ListingView, Room, Stage5Command, Stage5View, SaleView, SellerReview } from './stage5-contract';
import { firstAuctionEconomy, stage6Economy } from './stage6-auctions';
import { marketOffers, newMarketOffer, reviewFor, updateMarketOffer } from './market-dialogue';
import { prologueFrames } from './stage5-contract';
import { describeVehicle, hasBonusAuction, requiresLongBed, transportOffers } from './transport';
import type { TransportState } from './transport';

export interface OwnedItem extends GarageItemView {
  readonly value: number;
  readonly lotNumber: number | null;
  readonly baggageId?: string;
}

interface Deal {
  readonly lotNumber: number | null;
  readonly baggageId?: string;
  readonly repairCost?: number;
  readonly cost: number;
  readonly revenue: number;
}

export interface Stage5State {
  readonly base: Stage4State;
  readonly opening: typeof prologueFrames[number] | null;
  readonly room: Room | null;
  readonly legacyLot: boolean;
  readonly lotEdition: 5 | 6 | 7;
  readonly capacityUpgrades: readonly ('garage' | 'car' | 'shelves')[];
  readonly transport?: TransportState;
  readonly workshop?: true;
  readonly house?: 4 | 5;
  readonly baggageArrived: boolean;
  readonly items: readonly OwnedItem[];
  readonly cargo: readonly string[];
  readonly listings: readonly ListingView[];
  readonly reviews?: readonly SellerReview[];
  readonly deals: readonly Deal[];
  readonly lastSale: SaleView | null;
  readonly lastDeal: { readonly lotNumber: number | null; readonly repairCost?: number; readonly receipt: SoldReceipt } | null;
  readonly job: number;
  readonly jobIncorrect: boolean;
}

export const jobTasks = [
  { name: 'Велосипед', station: 'floor' },
  { name: 'Коробка с инструментами', station: 'shelf' },
  { name: 'Картонная упаковка', station: 'recycle' },
] as const;

const starter: readonly OwnedItem[] = [
  {
    id: 'home-kettle', name: 'Электрический чайник', value: 2000, lotNumber: null, size: 1, position: 'shelf',
    condition: 'good', clue: 'Целая подставка, крышка и провод.', estimate: { min: 1400, max: 2400 },
  },
  {
    id: 'home-lamp', name: 'Настольная лампа', value: 750, lotNumber: null, size: 1, position: 'shelf',
    condition: 'worn', clue: 'Плафон потёрт, лампа включается.', estimate: { min: 650, max: 950 },
  },
  {
    id: 'home-tools', name: 'Набор гаечных ключей', value: 600, lotNumber: null, size: 1, position: 'shelf',
    condition: 'worn', clue: 'Набор неполный, ключи целы.', estimate: { min: 450, max: 900 },
  },
];

export const stage6Defaults = {
  lotEdition: 6, capacityUpgrades: [], baggageArrived: false,
} as const;

function emptyStage(base: Stage4State): Stage5State {
  return {
    base, opening: null, room: null, legacyLot: false, ...stage6Defaults, items: [], cargo: [], listings: [],
    deals: [], lastSale: null, lastDeal: null, job: 0, jobIncorrect: false,
  };
}

export function newGame(seed?: number): Stage5State {
  const base = newBase(seed);
  return { ...emptyStage(migrateOpening(base)), opening: 'eviction' };
}

function hubGame(game: Stage4State['game'], status = game.status): Stage3HubState {
  const { revision, bank, nextSeed, offerSeeds, assets } = game;
  return {
    phase: 'hub', revision: revision + 1, bank, status, nextSeed, offerSeeds, assets,
    lotNumber: 'lotNumber' in game ? game.lotNumber : 0,
  };
}

function migrateOpening(base: Stage4State): Stage4State {
  return { ...base, relationshipOpen: false, game: { ...hubGame(base.game), revision: base.game.revision } };
}

export function migrateStage4(base: Stage4State): Stage5State {
  const game = base.game;
  if (game.phase === 'prologue') {
    const opening = game.storyIndex === 0 ? 'eviction' : game.storyIndex === 1 ? 'rain' : game.storyIndex === 8 ? 'keys' : 'call';
    return { ...emptyStage(migrateOpening(base)), opening };
  }
  const bank = toRubles(game.bank);
  if (base.relationshipOpen) return emptyStage({ ...base, game: { ...base.game, bank } });
  if ('lot' in game) {
    const lot = migrateLot(game.lot);
    const active = game.phase === 'bidding'
      ? { ...game, lot, bank, opponentBid: toRubles(game.opponentBid), lastPlayerBid: toRubles(game.lastPlayerBid) }
      : game.phase === 'reveal' ? { ...game, lot, bank, purchasePrice: toRubles(game.purchasePrice) }
      : game.phase === 'result' ? { ...game, lot, bank, receipt: migrateReceipt(game.receipt) } : { ...game, lot, bank };
    return { ...emptyStage({ ...base, game: active }), legacyLot: true };
  }
  if (game.phase === 'baggageInventory' || game.phase === 'baggageResult') {
    const contents = migratedEconomy.baggageContents(() => draw(game.baggageSeed).value);
    const active = game.phase === 'baggageInventory'
      ? { ...game, bank, contents, purchasePrice: toRubles(game.purchasePrice) }
      : { ...game, bank, contents, receipt: migrateReceipt(game.receipt) };
    return { ...emptyStage({ ...base, game: active }), legacyLot: true };
  }
  return { ...emptyStage({ ...base, game: { ...game, bank } }), room: game.phase === 'hub' ? 'home' : null };
}

export const carLimit = 4;
export const garageLimit = 8;
export const jewelryLimit = 4;
const upgrades = {
  garage: { price: 11000, current: garageLimit, next: 16 },
  car: { price: 18000, current: carLimit, next: 8 },
  shelves: { price: 26000, current: 16, next: 24 },
} as const;
export const housePrices = { 4: 380000, 5: 2800000 } as const;
export const capacityLimit = (owned: readonly string[], target: 'garage' | 'car'): number =>
  target === 'garage' && owned.includes('shelves') ? upgrades.shelves.next
    : owned.includes(target) ? upgrades[target].next : upgrades[target].current;
type TransportProfile = { readonly transport?: TransportState; readonly capacityUpgrades: readonly string[] };

export function transportFor(state: TransportProfile): TransportState {
  return state.transport ?? { model: state.capacityUpgrades.includes('car') ? 'van' : 'zhiguli' };
}

export function vehicleFor(state: TransportProfile) {
  return describeVehicle(transportFor(state));
}
export const economyFor = (state: Pick<Stage5State, 'legacyLot' | 'lotEdition'>) =>
  state.legacyLot ? migratedEconomy : state.lotEdition === 5 ? rubleEconomy
    : state.lotEdition === 7 ? firstAuctionEconomy : stage6Economy;
const occupied = (items: readonly GarageItemView[]): number => items.reduce((sum, item) => sum + item.size, 0);

export function updateStage5(state: Stage5State, patch: Partial<Omit<Stage5State, 'base'>>, bank = state.base.game.bank, status = state.base.game.status): Stage5State {
  const game = { ...state.base.game, revision: state.base.game.revision + 1, bank, status };
  const base = { ...state.base, game } as Stage4State;
  return { ...state, ...patch, base };
}

export function findSize(find: LotFind): GarageItemView['size'] {
  if ('size' in find && (find.size === 1 || find.size === 2)) return find.size;
  const large = /велосипед|сундук|напольный/i.test(find.name);
  return large ? 4 : /колонка|швейная|проигрыватель/i.test(find.name) ? 2 : 1;
}

function findInGarage(find: LotFind, lotNumber: number | null): OwnedItem {
  const size = findSize(find);
  return {
    id: find.id, name: find.name, value: find.salePrice, lotNumber, size,
    position: 'storage' in find && find.storage === 'jewelryBox' ? 'jewelryBox' : size === 4 ? 'floor' : 'shelf', condition: find.condition, clue: find.hint.text,
    estimate: find.hint.estimatedSalePrice ?? { min: find.salePrice, max: find.salePrice },
  };
}

function repairQuote(item: OwnedItem, bank: number, workshop = false) {
  if (item.condition !== 'damaged' || item.position === 'jewelryBox') return undefined;
  const kettle = /чайник/i.test(item.name);
  const standardPrice = kettle ? 500 : Math.max(300, Math.round(item.value * 0.25));
  const price = workshop ? Math.round(standardPrice * 0.75) : standardPrice;
  const min = kettle ? 3600 : Math.round(item.estimate.max * 1.4);
  const max = kettle ? 5000 : Math.round(item.estimate.max * 1.9);
  return { price, estimate: { min, max }, available: bank >= price };
}

function itemView(item: OwnedItem, bank: number, workshop = false): GarageItemView {
  const { value: _value, lotNumber: _lot, baggageId: _bag, ...view } = item;
  const repair = repairQuote(item, bank, workshop);
  return repair ? { ...view, repair } : view;
}

export function storageUsage(items: readonly GarageItemView[], jewelry: boolean): number {
  return occupied(items.filter(({ position }) => (position === 'jewelryBox') === jewelry));
}

type CargoGame = Extract<Stage4State['game'], { phase: 'reveal' | 'baggageInventory' }>;

export function hasTutorialDelivery(model: TransportState['model'], game: { lotNumber: number; lot: { sceneId: string } }): boolean {
  return model === 'scooter' && game.lotNumber === 1 && game.lot.sceneId === 'tutorial';
}

function isTutorialDelivery(state: TransportProfile, game: CargoGame, item: GarageItemView): boolean {
  return game.phase === 'reveal' && item.id === 'bicycle' && hasTutorialDelivery(transportFor(state).model, game);
}

export function transportLoad(state: TransportProfile, game: CargoGame, items: readonly GarageItemView[]): number {
  return items.reduce((sum, item) => sum + (isTutorialDelivery(state, game, item) ? 0 : item.size), 0);
}

export function transportBlock(state: TransportProfile, game: CargoGame, item: GarageItemView, used: number): string | null {
  const vehicle = vehicleFor(state);
  if (isTutorialDelivery(state, game, item)) return null;
  if (used + item.size > vehicle.capacity) return 'В транспорте нет места.';
  if (state.transport && (vehicle.model === 'scooter' || vehicle.model === 'zhiguli') && requiresLongBed(item.name)) {
    return 'Для длинномера нужен пикап или фургон.';
  }
  return null;
}

function baggageFind(item: RevealedFind): LotFind {
  return { ...item, condition: 'worn', hint: { text: 'Находка из забытого чемодана.', estimatedSalePrice: null } };
}

export function openCargoItems(game: CargoGame): OwnedItem[] {
  const contents = game.phase === 'reveal' ? game.lot : game.contents;
  const lotNumber = game.phase === 'reveal' ? game.lotNumber : null;
  const available = [...contents.visibleFinds,
    ...contents.boxes.filter(({ id }) => game.openedBoxIds.includes(id)).flatMap(({ contents: items }) => items)];
  return available.filter(({ id }) => !game.soldItemIds.includes(id))
    .map((item) => findInGarage('hint' in item ? item as LotFind : baggageFind(item), lotNumber));
}

function cargoFor(state: Stage5State, game: CargoGame) {
  const contents = game.phase === 'reveal' ? game.lot : game.contents;
  const boxes = contents.boxes.filter(({ id }) => !game.openedBoxIds.includes(id));
  const items = openCargoItems(game);
  const selected = items.filter(({ id }) => state.cargo.includes(id));
  const revenue = [...contents.visibleFinds, ...contents.boxes.flatMap(({ contents: finds }) => finds)]
    .filter(({ id }) => game.soldItemIds.includes(id)).reduce((sum, item) => sum + item.salePrice, 0);
  const reserved = transportLoad(state, game, selected);
  const used = storageUsage([...state.items, ...selected], false);
  const jewelry = storageUsage([...state.items, ...selected], true);
  const transport = game.phase === 'reveal';
  const vehicleLimit = vehicleFor(state).capacity;
  const roomLimit = capacityLimit(state.capacityUpgrades, 'garage');
  return {
    boxes, items, revenue, reserved, used, jewelry, transport, vehicleLimit, roomLimit,
    blocked(item: GarageItemView): string | null {
      if (state.cargo.includes(item.id)) return null;
      const reason = transport ? transportBlock(state, game, item, reserved) : null;
      if (reason) return reason;
      if (item.position === 'jewelryBox') return jewelry + item.size > jewelryLimit ? 'В шкатулке нет места.' : null;
      return used + item.size > roomLimit ? 'В гараже нет места.' : null;
    },
  };
}

function belongsTo(item: OwnedItem, deal: Deal): boolean {
  return deal.baggageId === undefined ? item.lotNumber === deal.lotNumber && deal.lotNumber !== null : item.baggageId === deal.baggageId;
}

function settleDeal(state: Stage5State, deal: Deal, items: readonly OwnedItem[]): Stage5State {
  const stillOpen = items.some((item) => belongsTo(item, deal));
  const otherDeals = state.deals.filter((other) => other.lotNumber !== deal.lotNumber || other.baggageId !== deal.baggageId);
  if (stillOpen) return { ...state, deals: [...otherDeals, deal] };

  const repairCost = deal.repairCost ?? 0;
  const profit = deal.revenue - deal.cost - repairCost;
  const status = state.base.game.status + (profit > 0 && deal.lotNumber !== null ? 2 : 0);
  return {
    ...state, deals: otherDeals,
    base: { ...state.base, game: { ...state.base.game, status } } as Stage4State,
    lastDeal: { lotNumber: deal.lotNumber, repairCost, receipt: { outcome: 'sold', purchasePrice: deal.cost + repairCost, revenue: deal.revenue, profit } },
  };
}

function handleCargo(state: Stage5State, command: Stage5Command, boxed: readonly OwnedItem[]): Stage5State | null {
  const game = state.base.game;
  if (game.phase !== 'reveal' && game.phase !== 'baggageInventory') return null;
  if (game.phase === 'baggageInventory' && !state.baggageArrived) {
    return command.type === 'receiveBaggage' ? updateStage5(state, { baggageArrived: true }) : state;
  }
  if (command.type === 'toggleCargo') {
    const cargo = cargoFor(state, game);
    const { itemId } = command;
    if (state.cargo.includes(itemId)) return updateStage5(state, { cargo: state.cargo.filter((id) => id !== itemId) });
    const item = cargo.items.find(({ id }) => id === itemId);
    return item && !cargo.blocked(item) ? updateStage5(state, { cargo: [...state.cargo, itemId] }) : state;
  }
  if (command.type === 'finishCargo') {
    return finishCargo(state, command.leaveRemaining, boxed)?.base ?? state;
  }
  return command.type === 'openBox' ? null : state;
}

export function finishCargo(
  state: Stage5State, leaveRemaining: boolean, boxed: readonly OwnedItem[], boxSelection: readonly string[] = [],
): { base: Stage5State; packed: readonly OwnedItem[] } | null {
  const game = state.base.game;
  if (game.phase !== 'reveal' && !(game.phase === 'baggageInventory' && state.baggageArrived)) return null;
  if (game.phase === 'reveal' && boxSelection.length) return null;
  const cargo = cargoFor(state, game);
  const selected = cargo.items.filter(({ id }) => state.cargo.includes(id));
  const pickedForBox = cargo.items.filter(({ id }) => boxSelection.includes(id) && !state.cargo.includes(id));
  if (pickedForBox.length !== boxSelection.length) return null;
  const remaining = cargo.boxes.length > 0 || selected.length + pickedForBox.length !== cargo.items.length;
  if (remaining && !leaveRemaining) return null;
  const baggageId = game.phase === 'baggageInventory' ? `baggage-${game.revision}` : undefined;
  const own = (item: OwnedItem): OwnedItem => ({
    ...item, id: `owned-${baggageId ?? game.lotNumber}-${item.id}`,
    ...(baggageId === undefined ? {} : { baggageId }),
  });
  const items = [...state.items, ...selected.map(own)];
  const packed = pickedForBox.map(own);
  const next = {
    ...state, items, cargo: [], legacyLot: false, baggageArrived: false, room: 'garage',
    base: { ...state.base, relationshipOpen: false, game: hubGame(game) },
  } as const;
  const deal = {
    lotNumber: game.phase === 'reveal' ? game.lotNumber : null, cost: game.purchasePrice,
    revenue: cargo.revenue, ...(baggageId === undefined ? {} : { baggageId }),
  };
  return { base: settleDeal(next, deal, [...items, ...boxed, ...packed]), packed };
}

export function listingsWithReplies(state: Stage5State): readonly ListingView[] {
  const { nextSeed, revision } = state.base.game;
  const occupied = new Set(state.listings.flatMap(listing => marketOffers(listing).map(({ buyer }) => buyer)));
  return state.listings.map((listing, index) => {
    const item = state.items.find(({ id }) => id === listing.itemId);
    if (!item) return listing;
    const word = draw(nextSeed ^ revision ^ Math.imul(index + 1, 0x9e3779b9)).word;
    const reply = newMarketOffer(listing, item, word, revision + 1, occupied)
      ?? newMarketOffer(listing, item, word, revision + 1, new Set());
    if (!reply) return listing;
    occupied.add(reply.buyer);
    return listing.offer ? { ...listing, otherOffers: [...(listing.otherOffers ?? []), reply] }
      : { ...listing, offer: reply };
  });
}

export function waitForOffers(state: Stage5State): Stage5State {
  return updateStage5(state, { listings: listingsWithReplies(state) });
}

export function settleSales(state: Stage5State, sales: readonly { item: OwnedItem; price: number | null }[], boxed: readonly OwnedItem[]): Stage5State {
  const sold = new Set(sales.map(({ item }) => item.id));
  const items = state.items.filter(({ id }) => !sold.has(id));
  const listings = state.listings.filter(({ itemId }) => !sold.has(itemId));
  const last = sales.filter(({ price }) => price !== null).at(-1);
  const lastSale = last && last.price !== null ? { name: last.item.name, price: last.price } : state.lastSale;
  const bank = state.base.game.bank + sales.reduce((sum, { price }) => sum + (price ?? 0), 0);
  if (!Number.isSafeInteger(bank)) return state;
  let next = updateStage5(state, { items, listings, lastSale }, bank);
  for (const deal of state.deals) {
    const relevant = sales.filter(({ item }) => belongsTo(item, deal));
    if (relevant.length) {
      const revenue = deal.revenue + relevant.reduce((sum, { price }) => sum + (price ?? 0), 0);
      if (!Number.isSafeInteger(revenue)) return state;
      next = settleDeal(next, { ...deal, revenue }, [...items, ...boxed]);
    }
  }
  return next;
}

function repairItem(state: Stage5State, item: OwnedItem): Stage5State {
  const quote = repairQuote(item, state.base.game.bank, state.workshop);
  if (!quote?.available) return state;
  const repaired = {
    ...item, condition: 'good' as const, estimate: quote.estimate,
    clue: 'После ремонта проверен, работает.', value: Math.round((quote.estimate.min + quote.estimate.max) / 2),
  };
  return updateStage5(state, {
    items: state.items.map((entry) => entry === item ? repaired : entry),
    listings: state.listings.filter(({ itemId }) => itemId !== item.id),
    deals: state.deals.map((deal) => belongsTo(item, deal) ? { ...deal, repairCost: (deal.repairCost ?? 0) + quote.price } : deal),
  }, state.base.game.bank - quote.price);
}

export function payForTransport(state: Stage5State, transport: TransportState, price: number): Stage5State {
  const profile = state.base;
  const game = profile.game;
  if (profile.relationshipOpen || game.phase !== 'hub' || game.bank < price) return state;
  const awarded = !game.assets.includes('car');
  const paid = updateStage5(state, { transport }, game.bank - price, game.status + (awarded ? 5 : 0));
  return awarded ? { ...paid, base: { ...profile, game: {
    ...game, revision: paid.base.game.revision, bank: paid.base.game.bank, status: paid.base.game.status, assets: [...game.assets, 'car'],
  } } } : paid;
}

function handleRoom(state: Stage5State, command: Stage5Command, boxed: readonly OwnedItem[]): Stage5State {
  switch (command.type) {
    case 'navigate':
      return command.room === state.room ? state : updateStage5(state, { room: command.room === 'auctions' ? null : command.room });
    case 'buyCapacity': {
      if (command.target === 'car' && state.transport) return state;
      if (command.target === 'shelves' && !state.capacityUpgrades.includes('garage')) return state;
      const upgrade = upgrades[command.target];
      const canBuyHere = state.room === 'garage' || (state.room === 'car' && command.target === 'car');
      if (!canBuyHere || !upgrade || state.capacityUpgrades.includes(command.target) || state.base.game.bank < upgrade.price) return state;
      return updateStage5(state, { capacityUpgrades: [...state.capacityUpgrades, command.target] }, state.base.game.bank - upgrade.price);
    }
    case 'buyHouse': {
      const next = state.house === undefined ? 4 : state.house === 4 ? 5 : null;
      if (state.room !== 'home' || !state.workshop || command.level !== next) return state;
      const price = housePrices[command.level];
      return state.base.game.bank >= price ? updateStage5(state, { house: command.level }, state.base.game.bank - price) : state;
    }
    case 'upgradeTransport': {
      if (state.room !== 'car') return state;
      const offer = transportOffers(transportFor(state)).find(({ id }) => id === command.upgrade);
      if (!offer || state.base.game.bank < offer.price) return state;
      const game = state.base.game;
      if (game.phase !== 'hub') return state;
      if (offer.id === 'restoreZhiguli' && game.lotNumber === 0) return state;
      return payForTransport(state, offer.next, offer.price);
    }
    case 'repairItem': {
      const item = state.items.find(({ id }) => id === command.itemId);
      return state.room === 'garage' && item ? repairItem(state, item) : state;
    }
    case 'cancelListing': {
      if (state.room !== 'market' || !state.listings.some(({ id }) => id === command.listingId)) return state;
      return updateStage5(state, { listings: state.listings.filter(({ id }) => id !== command.listingId) });
    }
    case 'discardItem': {
      const item = state.items.find(({ id }) => id === command.itemId);
      return state.room === 'garage' && item ? settleSales(state, [{ item, price: null }], boxed) : state;
    }
    case 'publish': {
      if (state.room !== 'market' || !Number.isSafeInteger(command.price) || command.price <= 0) return state;
      if (!state.items.some(({ id }) => id === command.itemId)) return state;
      const listings = state.listings.filter(({ itemId }) => itemId !== command.itemId);
      const draft = {
        id: `listing-${state.base.game.revision + 1}`, itemId: command.itemId, price: command.price, offer: null,
      };
      return updateStage5(state, { listings: listingsWithReplies({ ...state, listings: [...listings, draft] }) });
    }
    case 'waitForBuyer':
      if ((state.room !== 'market' && state.room !== 'inbox') || !state.listings.length) return state;
      return waitForOffers(state);
    case 'readOffer':
    case 'counterOffer':
    case 'messageBuyer':
    case 'acceptOffer': {
      if (state.room !== 'inbox') return state;
      const listing = state.listings.find(({ id }) => id === command.listingId);
      const offer = listing && marketOffers(listing).find(({ id }) => id === command.offerId);
      const item = listing && state.items.find(({ id }) => id === listing.itemId);
      if (!listing || !offer || !item) return state;
      if (command.type === 'acceptOffer') {
        if (offer.closed) return state;
        const next = settleSales(state, [{ item, price: offer.price }], boxed);
        if (next === state) return state;
        const reviews = state.reviews ?? [];
        const review = reviewFor(item, offer, state.base.game.nextSeed ^ state.base.game.revision);
        return { ...next, reviews: [...reviews.slice(-99), review] };
      }
      let reply: typeof offer | null = { ...offer, unread: false };
      if (command.type === 'counterOffer') {
        if (offer.delivery || !Number.isSafeInteger(command.price) || command.price <= offer.price || command.price > listing.price) return state;
        reply = updateMarketOffer(offer, `Предлагаю ${command.price} ₽.`, command.price, state.base.game.revision + 1, Math.min(listing.price, item.value));
      } else if (command.type === 'messageBuyer') {
        reply = updateMarketOffer(offer, command.text, undefined, state.base.game.revision + 1, Math.min(listing.price, item.value));
        if (reply) reply = { ...reply, unread: false };
      } else if (!offer.unread) return state;
      if (!reply) return state;
      const updated = reply;
      return updateStage5(state, { listings: state.listings.map(entry => entry !== listing ? entry : {
        ...entry,
        offer: entry.offer === offer ? updated : entry.offer,
        ...(entry.otherOffers ? { otherOffers: entry.otherOffers.map(other => other === offer ? updated : other) } : {}),
      }) });
    }
    default:
      return state;
  }
}

export function applyCommand(state: Stage5State, command: Stage5Command, boxed: readonly OwnedItem[] = []): Stage5State {
  const { game } = state.base;
  if (game.revision !== command.expectedRevision) return state;

  if (state.opening !== null) {
    if (command.type !== 'skipStory' && command.type !== 'storyNext') return state;
    const opening = prologueFrames[prologueFrames.indexOf(state.opening) + 1];
    if (opening && command.type === 'storyNext') return updateStage5(state, { opening });
    return {
      ...state, opening: null, room: 'garage', items: starter,
      base: { ...state.base, relationshipOpen: false, game: hubGame(game) },
    };
  }

  if (state.room !== null) return handleRoom(state, command, boxed);
  if (state.transport && command.type === 'spend' && command.offerId === 'car') return state;
  if (game.phase === 'hub' && !state.base.relationshipOpen && command.type === 'navigate' && command.room !== 'auctions') {
    return updateStage5(state, { room: command.room });
  }
  if (game.phase === 'recovery') {
    if (command.type === 'sortItem' && state.job < jobTasks.length) {
      return command.station === jobTasks[state.job]!.station
        ? updateStage5(state, { job: state.job + 1, jobIncorrect: false })
        : updateStage5(state, { jobIncorrect: true });
    }
    if (command.type === 'navigate' && command.room === 'home') {
      return { ...state, base: { ...state.base, game: { ...hubGame(game), lotNumber: game.lotNumber - 1 } },
        room: 'home', job: 0, jobIncorrect: false };
    }
    if (command.type !== 'claimJob' || state.job !== jobTasks.length) return state;
    const base = applyBase(state.base, { type: 'sortGarage', expectedRevision: command.expectedRevision }, economyFor(state));
    return base === state.base ? state : { ...state, base, job: 0, jobIncorrect: false };
  }

  const shipping = handleCargo(state, command, boxed);
  if (shipping) return shipping;
  switch (command.type) {
    case 'navigate':
    case 'toggleCargo':
    case 'finishCargo':
    case 'discardItem':
    case 'publish':
    case 'waitForBuyer':
    case 'readOffer':
    case 'acceptOffer':
    case 'claimJob':
    case 'sortItem':
    case 'sortGarage':
    case 'buyCapacity':
    case 'buyHouse':
    case 'upgradeTransport':
    case 'repairItem':
    case 'counterOffer':
    case 'cancelListing':
    case 'receiveBaggage':
    case 'messageBuyer':
      return state;
  }
  const edition = command.type === 'enterAuction'
    ? game.phase === 'hub' && game.lotNumber === 0 && (game.bank < 3000 || state.transport?.model === 'scooter') && command.tier === 'ordinary' ? 7 : 6
    : state.lotEdition;
  const base = applyBase(state.base, command, command.type === 'enterAuction'
    ? economyFor({ legacyLot: false, lotEdition: edition }) : economyFor(state));
  if (base === state.base) return state;
  const returned = base.game.phase === 'hub' && !base.relationshipOpen;
  const room = returned && command.type === 'nextLot' ? 'home' : null;
  return { ...state, base, room, legacyLot: state.legacyLot && !returned, lotEdition: edition };
}

export function getView(state: Stage5State): Stage5View {
  const game = state.base.game;
  const { bank, revision } = game;
  if (state.opening !== null) return { phase: 'opening', bank, revision, frame: state.opening, vehicle: vehicleFor(state) };
  if (state.room !== null) {
    return {
      phase: state.room, bank, revision, items: state.items.map((item) => itemView(item, bank, state.workshop)), listings: state.listings,
      unread: state.listings.flatMap(marketOffers).filter(({ unread }) => unread).length,
      reviews: state.reviews ?? [],
      garage: { used: storageUsage(state.items, false), limit: capacityLimit(state.capacityUpgrades, 'garage') },
      vehicle: vehicleFor(state),
      ...(state.room === 'car' ? { transportOffers: transportOffers(transportFor(state)).map(({ next, ...offer }) => ({
        ...offer, capacity: describeVehicle(next).capacity, auctions: hasBonusAuction(next) ? 4 as const : 3 as const,
        blocked: offer.id === 'restoreZhiguli' && 'lotNumber' in game && game.lotNumber === 0 ? 'Сначала съезди на первые торги на скутере.' : null,
      })) } : {}),
      homeImproved: game.assets.includes('home'),
      ...(state.workshop ? { workshop: true } as const : {}),
      ...(state.house ? { house: state.house } : {}),
      jewelry: { used: storageUsage(state.items, true), limit: jewelryLimit },
      upgrades: (['garage', 'car', 'shelves'] as const).filter((target) => !state.capacityUpgrades.includes(target) &&
        (target !== 'car' || !state.transport) && (target !== 'shelves' || state.capacityUpgrades.includes('garage')))
        .map((target) => ({ target, ...upgrades[target], available: bank >= upgrades[target].price })),
      lastSale: state.lastSale,
      lastDeal: state.lastDeal, deals: state.deals,
    };
  }
  if (game.phase === 'baggageInventory' && !state.baggageArrived) return { phase: 'baggageArrival', bank, revision };
  if (game.phase === 'reveal' || game.phase === 'baggageInventory') {
    const cargo = cargoFor(state, game);
    return {
      phase: 'cargo', bank, revision, sceneId: game.phase === 'reveal' ? game.lot.sceneId : 'household', lotNumber: game.lotNumber,
      ...(game.phase === 'baggageInventory' ? {
        baggage: true,
        floor: game.assets.includes('home') ? 'parquet' : game.baggageSeed % 2 ? 'stone' : 'boards',
      } as const : {}),
      purchasePrice: game.purchasePrice, revenue: cargo.revenue,
      car: { used: cargo.reserved, limit: cargo.vehicleLimit }, garage: { used: cargo.used, limit: cargo.roomLimit },
      vehicle: vehicleFor(state),
      jewelry: { used: cargo.jewelry, limit: jewelryLimit },
      boxes: cargo.boxes.map(({ id, name }) => ({ id, name })),
      items: cargo.items.map((item) => ({
        ...itemView(item, bank, state.workshop), selected: state.cargo.includes(item.id), blocked: cargo.blocked(item),
        ...(isTutorialDelivery(state, game, item) ? { tutorialDelivery: true } as const : {}),
      })),
    };
  }
  if (game.phase === 'recovery') {
    return {
      phase: 'job', bank, revision, minimumBid: game.lot.openingBid, reward: game.lot.openingBid - bank,
      task: jobTasks[state.job]?.name ?? null, completed: state.job, total: jobTasks.length, incorrect: state.jobIncorrect,
    };
  }
  const view = baseView(state.base, economyFor(state));
  if (view.phase === 'prologue' || view.phase === 'reveal' || view.phase === 'recovery') {
    throw new Error('Некорректная фаза Stage 5.');
  }
  return view.phase === 'hub' && state.transport ? { ...view, offers: view.offers.filter(({ id }) => id !== 'car') } : view;
}
