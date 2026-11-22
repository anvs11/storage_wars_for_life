import type { LotFind } from './catalog';
import type { SoldReceipt } from './contract';
import { draw } from './random';
import type { Stage3HubState } from './stage3-engine';
import type { Stage4State } from './stage4-engine';
import { applyCommand as applyBase, getView as baseView, newGame as newBase } from './stage4-engine';
import { migrateLot, migrateReceipt, migratedEconomy, rubleEconomy, toRubles } from './stage5-economy';
import type { GarageItemView, ListingView, Room, Stage5Command, Stage5View, SaleView } from './stage5-contract';
import { prologueFrames } from './stage5-contract';

export interface OwnedItem extends GarageItemView {
  readonly value: number;
  readonly lotNumber: number | null;
}

interface Deal {
  readonly lotNumber: number;
  readonly cost: number;
  readonly revenue: number;
}

export interface Stage5State {
  readonly base: Stage4State;
  readonly opening: typeof prologueFrames[number] | null;
  readonly room: Room | null;
  readonly legacyLot: boolean;
  readonly items: readonly OwnedItem[];
  readonly cargo: readonly string[];
  readonly listings: readonly ListingView[];
  readonly deals: readonly Deal[];
  readonly lastSale: SaleView | null;
  readonly lastDeal: { readonly lotNumber: number; readonly receipt: SoldReceipt } | null;
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

function emptyStage(base: Stage4State): Stage5State {
  return {
    base, opening: null, room: null, legacyLot: false, items: [], cargo: [], listings: [],
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
const occupied = (items: readonly GarageItemView[]): number => items.reduce((sum, item) => sum + item.size, 0);

function changed(state: Stage5State, patch: Partial<Omit<Stage5State, 'base'>>, bank = state.base.game.bank, status = state.base.game.status): Stage5State {
  const game = { ...state.base.game, revision: state.base.game.revision + 1, bank, status };
  const base = { ...state.base, game } as Stage4State;
  return { ...state, ...patch, base };
}

export function findSize(find: LotFind): GarageItemView['size'] {
  const large = /велосипед|сундук|напольный/i.test(find.name);
  return large ? 4 : /колонка|швейная|проигрыватель/i.test(find.name) ? 2 : 1;
}

function findInGarage(find: LotFind, lotNumber: number): OwnedItem {
  const size = findSize(find);
  return {
    id: find.id, name: find.name, value: find.salePrice, lotNumber, size,
    position: size === 4 ? 'floor' : 'shelf', condition: find.condition, clue: find.hint.text,
    estimate: find.hint.estimatedSalePrice ?? { min: find.salePrice, max: find.salePrice },
  };
}

function itemView({ value: _value, lotNumber: _lot, ...view }: OwnedItem): GarageItemView {
  return view;
}

function cargoFor(state: Stage5State, view: Extract<Stage4State['game'], { phase: 'reveal' }>) {
  const { lot, lotNumber, openedBoxIds, soldItemIds } = view;
  const boxes = lot.boxes.filter(({ id }) => !openedBoxIds.includes(id));
  const finds = [
    ...lot.visibleFinds,
    ...lot.boxes.filter(({ id }) => openedBoxIds.includes(id)).flatMap(({ contents }) => contents),
  ];
  const items = finds.filter(({ id }) => !soldItemIds.includes(id)).map((find) => findInGarage(find, lotNumber));
  const revenue = [...lot.visibleFinds, ...lot.boxes.flatMap(({ contents }) => contents)]
    .filter(({ id }) => soldItemIds.includes(id)).reduce((sum, item) => sum + item.salePrice, 0);
  const reserved = occupied(items.filter(({ id }) => state.cargo.includes(id)));
  const used = occupied(state.items);
  return {
    boxes, items, revenue, reserved, used,
    blocked(item: GarageItemView): string | null {
      if (state.cargo.includes(item.id)) return null;
      if (reserved + item.size > carLimit) return 'В машине нет места.';
      if (reserved + item.size + used > garageLimit) return 'В гараже нет места.';
      return null;
    },
  };
}

function settleDeal(state: Stage5State, deal: Deal, items: readonly OwnedItem[]): Stage5State {
  const stillOpen = items.some(({ lotNumber }) => lotNumber === deal.lotNumber);
  const otherDeals = state.deals.filter(({ lotNumber }) => lotNumber !== deal.lotNumber);
  if (stillOpen) return { ...state, deals: [...otherDeals, deal] };

  const profit = deal.revenue - deal.cost;
  const status = state.base.game.status + (profit > 0 ? 2 : 0);
  return {
    ...state, deals: otherDeals,
    base: { ...state.base, game: { ...state.base.game, status } } as Stage4State,
    lastDeal: { lotNumber: deal.lotNumber, receipt: { outcome: 'sold', purchasePrice: deal.cost, revenue: deal.revenue, profit } },
  };
}

function handleCargo(state: Stage5State, command: Stage5Command): Stage5State | null {
  const game = state.base.game;
  if (game.phase !== 'reveal') return null;
  const cargo = cargoFor(state, game);
  if (command.type === 'toggleCargo') {
    const { itemId } = command;
    if (state.cargo.includes(itemId)) return changed(state, { cargo: state.cargo.filter((id) => id !== itemId) });
    const item = cargo.items.find(({ id }) => id === itemId);
    return item && !cargo.blocked(item) ? changed(state, { cargo: [...state.cargo, itemId] }) : state;
  }
  if (command.type === 'finishCargo') {
    const selected = cargo.items.filter(({ id }) => state.cargo.includes(id));
    const remaining = cargo.boxes.length > 0 || selected.length !== cargo.items.length;
    if (remaining && !command.leaveRemaining) return state;
    const items = [...state.items, ...selected.map((item) => ({ ...item, id: `owned-${game.lotNumber}-${item.id}` }))];
    const next = {
      ...state, items, cargo: [], legacyLot: false, room: 'garage',
      base: { ...state.base, relationshipOpen: false, game: hubGame(game) },
    } as const;
    return settleDeal(next, { lotNumber: game.lotNumber, cost: game.purchasePrice, revenue: cargo.revenue }, items);
  }
  return command.type === 'openBox' ? null : state;
}

const buyers = ['Ирина', 'Алексей', 'Светлана'] as const;

function buyerOffer(state: Stage5State, listing: ListingView, item: OwnedItem): ListingView {
  const { word } = draw(state.base.game.nextSeed ^ state.base.game.revision);
  const fairValue = item.lotNumber === null ? item.value : Math.round(item.value * (85 + word % 26) / 100);
  if (listing.price > item.estimate.max * 1.5 || (item.lotNumber !== null && word % 4 === 0)) return listing;
  return {
    ...listing, offer: {
      id: `offer-${listing.id}-${state.base.game.revision + 1}`,
      buyer: buyers[word % buyers.length]!, price: Math.min(listing.price, Math.max(1, fairValue)), unread: true,
    },
  };
}

function handleSale(state: Stage5State, item: OwnedItem, price: number | null): Stage5State {
  const items = state.items.filter(({ id }) => id !== item.id);
  const listings = state.listings.filter(({ itemId }) => itemId !== item.id);
  const lastSale = price === null ? state.lastSale : { name: item.name, price };
  const bank = state.base.game.bank + (price ?? 0);
  if (!Number.isSafeInteger(bank)) return state;
  const next = changed(state, { items, listings, lastSale }, bank);
  const deal = state.deals.find(({ lotNumber }) => lotNumber === item.lotNumber);
  return deal ? settleDeal(next, { ...deal, revenue: deal.revenue + (price ?? 0) }, items) : next;
}

function handleRoom(state: Stage5State, command: Stage5Command): Stage5State {
  switch (command.type) {
    case 'navigate':
      return command.room === state.room ? state : changed(state, { room: command.room === 'auctions' ? null : command.room });
    case 'discardItem': {
      const item = state.items.find(({ id }) => id === command.itemId);
      return state.room === 'garage' && item ? handleSale(state, item, null) : state;
    }
    case 'publish': {
      if (state.room !== 'market' || !Number.isSafeInteger(command.price) || command.price <= 0) return state;
      if (!state.items.some(({ id }) => id === command.itemId)) return state;
      const listings = state.listings.filter(({ itemId }) => itemId !== command.itemId);
      return changed(state, {
        listings: [...listings, {
          id: `listing-${state.base.game.revision + 1}`, itemId: command.itemId, price: command.price, offer: null,
        }],
      });
    }
    case 'waitForBuyer':
      if ((state.room !== 'market' && state.room !== 'inbox') || !state.listings.length) return state;
      return changed(state, {
        listings: state.listings.map((listing) => buyerOffer(state, listing, state.items.find(({ id }) => id === listing.itemId)!)),
      });
    case 'readOffer':
    case 'acceptOffer': {
      if (state.room !== 'inbox') return state;
      const listing = state.listings.find(({ id }) => id === command.listingId);
      if (!listing?.offer || listing.offer.id !== command.offerId) return state;
      if (command.type === 'acceptOffer') {
        const item = state.items.find(({ id }) => id === listing.itemId);
        return item ? handleSale(state, item, listing.offer.price) : state;
      }
      const offer = { ...listing.offer, unread: false };
      return listing.offer.unread ? changed(state, {
        listings: state.listings.map((entry) => entry === listing ? { ...entry, offer } : entry),
      }) : state;
    }
    default:
      return state;
  }
}

export function applyCommand(state: Stage5State, command: Stage5Command): Stage5State {
  const { game } = state.base;
  if (game.revision !== command.expectedRevision) return state;

  if (state.opening !== null) {
    if (command.type !== 'skipStory' && command.type !== 'storyNext') return state;
    const opening = prologueFrames[prologueFrames.indexOf(state.opening) + 1];
    if (opening && command.type === 'storyNext') return changed(state, { opening });
    return {
      ...state, opening: null, room: 'garage', items: starter,
      base: { ...state.base, relationshipOpen: false, game: hubGame(game) },
    };
  }

  if (state.room !== null) return handleRoom(state, command);
  if (game.phase === 'hub' && !state.base.relationshipOpen && command.type === 'navigate' && command.room !== 'auctions') {
    return changed(state, { room: command.room });
  }
  if (game.phase === 'recovery') {
    if (command.type === 'sortItem' && state.job < jobTasks.length) {
      return command.station === jobTasks[state.job]!.station
        ? changed(state, { job: state.job + 1, jobIncorrect: false })
        : changed(state, { jobIncorrect: true });
    }
    if (command.type !== 'claimJob' || state.job !== jobTasks.length) return state;
    const base = applyBase(state.base, { type: 'sortGarage', expectedRevision: command.expectedRevision }, rubleEconomy);
    return base === state.base ? state : { ...state, base, job: 0, jobIncorrect: false };
  }

  const shipping = handleCargo(state, command);
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
      return state;
  }
  const base = applyBase(state.base, command, state.legacyLot ? migratedEconomy : rubleEconomy);
  if (base === state.base) return state;
  const returned = base.game.phase === 'hub' && !base.relationshipOpen;
  const room = returned && command.type === 'nextLot' ? 'home' : null;
  return { ...state, base, room, legacyLot: state.legacyLot && !returned };
}

export function getView(state: Stage5State): Stage5View {
  const game = state.base.game;
  const { bank, revision } = game;
  if (state.opening !== null) return { phase: 'opening', bank, revision, frame: state.opening };
  if (state.room !== null) {
    return {
      phase: state.room, bank, revision, items: state.items.map(itemView), listings: state.listings,
      unread: state.listings.filter(({ offer }) => offer?.unread).length,
      garage: { used: occupied(state.items), limit: garageLimit }, lastSale: state.lastSale,
      lastDeal: state.lastDeal, deals: state.deals,
    };
  }
  if (game.phase === 'reveal') {
    const cargo = cargoFor(state, game);
    return {
      phase: 'cargo', bank, revision, sceneId: game.lot.sceneId, lotNumber: game.lotNumber,
      purchasePrice: game.purchasePrice, revenue: cargo.revenue,
      car: { used: cargo.reserved, limit: carLimit }, garage: { used: cargo.used + cargo.reserved, limit: garageLimit },
      boxes: cargo.boxes.map(({ id, name }) => ({ id, name })),
      items: cargo.items.map((item) => ({
        ...itemView(item), selected: state.cargo.includes(item.id), blocked: cargo.blocked(item),
      })),
    };
  }
  if (game.phase === 'recovery') {
    return {
      phase: 'job', bank, revision, minimumBid: game.lot.openingBid, reward: game.lot.openingBid - bank,
      task: jobTasks[state.job]?.name ?? null, completed: state.job, total: jobTasks.length, incorrect: state.jobIncorrect,
    };
  }
  const view = baseView(state.base, state.legacyLot ? migratedEconomy : rubleEconomy);
  if (view.phase === 'prologue' || view.phase === 'reveal' || view.phase === 'recovery') {
    throw new Error('Некорректная фаза Stage 5.');
  }
  return view;
}
