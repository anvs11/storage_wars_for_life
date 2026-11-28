import { baggagePrice, chooseBaggage } from './baggage';
import type { GarageLot } from './catalog';
import type { SoldReceipt } from './contract';
import { emptyInventory, interactWithInventory, inventoryView } from './inventory';
import type { InventoryContents, InventoryProgress } from './inventory';
import { auctions, isAsset, offerIds, offers, tiers } from './progression';
import type { Asset } from './progression';
import { draw, freshSeed } from './random';
import { advanceAuctionPrice, generateLot, openingBidFor } from './repeat-auctions';
import { applyGarageCommand, applyStoryCommand, enterLot, getView as getGarageView, initialPrologue } from './stage2-engine';
import type { GarageState, Stage2State } from './stage2-engine';
import type { AuctionOpponentView, AuctionTier, OfferId, Stage3Command, Stage3Scene, Stage3View } from './stage3-contract';

export interface GameEconomy {
  readonly openBidding?: boolean;
  readonly openingBid: (tier: AuctionTier, seed: number, lotNumber: number) => number;
  readonly lot: (tier: AuctionTier, seed: number, lotNumber: number) => GarageLot<Stage3Scene>;
  readonly advancePrice: (price: number) => number;
  readonly offerPrice: (offerId: OfferId) => number;
  readonly baggagePrice: number;
  readonly baggageContents: typeof chooseBaggage;
  readonly flowerPrice: number;
}

export const legacyEconomy: GameEconomy = {
  openingBid: openingBidFor, lot: generateLot, advancePrice: advanceAuctionPrice,
  offerPrice: (id) => offers[id].price, baggagePrice, baggageContents: chooseBaggage, flowerPrice: 8,
};

export interface Stage3Progress {
  readonly nextSeed: number;
  readonly offerSeeds: Readonly<Record<AuctionTier, number>>;
  readonly assets: readonly Asset[];
}

interface BetweenLots {
  readonly revision: number;
  readonly bank: number;
  readonly status: number;
  readonly lotNumber: number;
}

interface Baggage extends InventoryProgress {
  readonly baggageSeed: number;
  readonly contents: InventoryContents;
}

type AirportState = BetweenLots & (
  | { readonly phase: 'airportOffer' }
  | (Baggage & { readonly phase: 'baggageInventory'; readonly purchasePrice: number })
  | (Baggage & { readonly phase: 'baggageResult'; readonly receipt: SoldReceipt })
);

type Auction = GarageState<Stage3Scene> & {
  readonly tier: AuctionTier;
  readonly lotSeed: number | null;
};

export type Stage3State = Stage3Progress & (
  | Extract<Stage2State, { phase: 'prologue' }>
  | Auction
  | (BetweenLots & { readonly phase: 'hub' })
  | AirportState
);

export type Stage3HubState = Extract<Stage3State, { phase: 'hub' }>;

function initialProgress(seed: number): Stage3Progress {
  const ordinary = draw(seed);
  const selected = draw(ordinary.seed);
  const antique = draw(selected.seed);
  return {
    offerSeeds: { ordinary: ordinary.word, selected: selected.word, antique: antique.word },
    nextSeed: antique.seed,
    assets: [],
  };
}

export function newGame(seed = freshSeed()): Stage3State {
  return { ...initialPrologue, ...initialProgress(seed) };
}

export function migrateStage2(state: Stage2State): Stage3State {
  const progress = initialProgress(draw((state.revision ^ state.bank ^ 0x98d21a37) >>> 0).word);
  if (state.phase === 'prologue') return { ...state, ...progress };
  return { ...state, ...progress, tier: 'ordinary', lotSeed: null };
}

type HubView = Extract<Stage3View, { phase: 'hub' }>;

function auctionEntry(tier: AuctionTier, state: BetweenLots & Stage3Progress, economy: GameEconomy): HubView['auctions'][number] {
  const { title, requiredStatus } = auctions[tier];
  const openingBid = economy.openingBid(tier, state.offerSeeds[tier], state.lotNumber + 1);
  const common = { tier, title, requiredStatus, openingBid };
  if (state.status < requiredStatus) return { ...common, availability: 'statusLocked' };
  if (state.bank < openingBid) return { ...common, availability: tier === 'ordinary' ? 'recovery' : 'fundsLocked' };
  return { ...common, availability: 'ready' };
}

function offerEntry(id: OfferId, state: BetweenLots & Stage3Progress, economy: GameEconomy): HubView['offers'][number] {
  const offer = { id, ...offers[id], price: economy.offerPrice(id) };
  if (isAsset(id) && state.assets.includes(id)) return { ...offer, availability: 'owned' };
  if (state.status < offer.requiredStatus) return { ...offer, availability: 'statusLocked' };
  return { ...offer, availability: state.bank >= offer.price ? 'ready' : 'fundsLocked' };
}

function nextProfile(state: BetweenLots & Stage3Progress): BetweenLots & Stage3Progress {
  const { bank, status, lotNumber, nextSeed, offerSeeds, assets } = state;
  return { bank, status, lotNumber, revision: state.revision + 1, nextSeed, offerSeeds, assets };
}

export function applySpending(state: Stage3HubState, offerId: OfferId, economy = legacyEconomy): Stage3HubState {
  const offer = offerEntry(offerId, state, economy);
  if (offer.availability !== 'ready') return state;
  return {
    ...state, revision: state.revision + 1, bank: state.bank - offer.price, status: state.status + offer.statusGain,
    assets: isAsset(offerId) ? [...state.assets, offerId] : state.assets,
  };
}

function applyHubCommand(state: Stage3HubState, command: Stage3Command, economy = legacyEconomy): Stage3State {
  switch (command.type) {
    case 'enterAuction': {
      const { tier } = command;
      const { availability } = auctionEntry(tier, state, economy);
      if (availability !== 'ready' && availability !== 'recovery') return state;
      const profile = nextProfile(state);
      const lotSeed = state.offerSeeds[tier];
      const next = draw(state.nextSeed);
      const lotNumber = profile.lotNumber + 1;
      return {
        ...enterLot(profile, lotNumber, economy.lot(tier, lotSeed, lotNumber)),
        tier,
        lotSeed,
        assets: profile.assets,
        nextSeed: next.seed,
        offerSeeds: { ...profile.offerSeeds, [tier]: next.word },
      };
    }
    case 'spend':
      return applySpending(state, command.offerId, economy);
    case 'callAirport':
      return { ...nextProfile(state), phase: 'airportOffer' };
    default:
      return state;
  }
}

function applyAirportCommand(state: AirportState & Stage3Progress, command: Stage3Command, economy = legacyEconomy): Stage3State {
  const profile = nextProfile(state);
  if (command.type === 'returnToHub' && state.phase !== 'baggageInventory') {
    return { ...profile, phase: 'hub' };
  }
  if (state.phase === 'airportOffer' && command.type === 'buyBaggage' && state.bank >= economy.baggagePrice) {
    const next = draw(state.nextSeed);
    return {
      ...profile, phase: 'baggageInventory', bank: state.bank - economy.baggagePrice, purchasePrice: economy.baggagePrice,
      baggageSeed: state.nextSeed, nextSeed: next.seed, contents: economy.baggageContents(() => next.value), ...emptyInventory,
    };
  }
  if (state.phase !== 'baggageInventory') return state;
  if (command.type !== 'openBox' && command.type !== 'sellItem' && command.type !== 'sellAll') return state;

  const update = interactWithInventory(state.contents, state, command);
  if (!update) return state;
  const next = {
    ...profile, bank: state.bank + update.proceeds, baggageSeed: state.baggageSeed,
    contents: state.contents, ...update.inventory,
  };
  return update.receipt
    ? { ...next, phase: 'baggageResult', receipt: update.receipt }
    : { ...next, phase: 'baggageInventory', purchasePrice: state.purchasePrice };
}

export function applyCommand(state: Stage3State, command: Stage3Command, economy = legacyEconomy): Stage3State {
  if (state.revision !== command.expectedRevision) return state;
  if (state.phase === 'hub') return applyHubCommand(state, command, economy);
  if (state.phase === 'airportOffer' || state.phase === 'baggageInventory' || state.phase === 'baggageResult') {
    return applyAirportCommand(state, command, economy);
  }
  if (command.type === 'enterAuction' || command.type === 'spend' || command.type === 'callAirport' ||
      command.type === 'buyBaggage' || command.type === 'returnToHub') return state;

  const { nextSeed, offerSeeds, assets } = state;
  const progress = { nextSeed, offerSeeds, assets };
  if (state.phase === 'prologue') {
    const updated = applyStoryCommand(state, command);
    if (updated === state) return state;
    return updated.phase === 'prologue'
      ? { ...updated, ...progress }
      : { ...updated, ...progress, tier: 'ordinary', lotSeed: null };
  }
  if (state.phase === 'result' && command.type === 'nextLot') {
    return { ...nextProfile(state), phase: 'hub' };
  }
  const next = applyGarageCommand(state, command, state.lotSeed === null ? undefined : economy.advancePrice);
  return next === state ? state : { ...next, ...progress, tier: state.tier, lotSeed: state.lotSeed };
}

export function getView(state: Stage3State, economy = legacyEconomy): Stage3View {
  const { phase, bank, revision } = state;
  const base = { revision, bank };
  switch (phase) {
    case 'hub': {
      const auctionEntries = tiers.map((tier) => auctionEntry(tier, state, economy));
      const offerEntries = offerIds.map((id) => offerEntry(id, state, economy));
      const upcoming = auctionEntries.find(({ requiredStatus }) => requiredStatus > state.status);
      const nextUnlock = upcoming ? { title: upcoming.title, requiredStatus: upcoming.requiredStatus } : null;
      const allowedActions: ('enterAuction' | 'spend' | 'callAirport')[] = ['enterAuction'];
      if (offerEntries.some(({ availability }) => availability === 'ready')) allowedActions.push('spend');
      allowedActions.push('callAirport');
      return { ...base, phase, status: state.status, nextUnlock, auctions: auctionEntries, offers: offerEntries, baggagePrice: economy.baggagePrice, allowedActions };
    }
    case 'airportOffer': {
      const canAfford = bank >= economy.baggagePrice;
      return { ...base, phase, price: economy.baggagePrice, canAfford, allowedActions: canAfford ? ['buyBaggage', 'returnToHub'] : ['returnToHub'] };
    }
    case 'baggageInventory':
      return { ...base, phase, ...inventoryView(state.contents, state) };
    case 'baggageResult':
      return { ...base, phase, receipt: state.receipt, allowedActions: ['returnToHub'] };
    case 'prologue':
      return getGarageView(state);
    default: {
      const advancePrice = state.lotSeed === null ? (price: number) => price + state.lot.bidIncrement : economy.advancePrice;
      const view = getGarageView(state, advancePrice);
      if (view.phase === 'recovery' || view.phase === 'prologue') return view;
      if (state.phase === 'inspection' || state.phase === 'bidding') {
        let amount = state.phase === 'bidding' ? state.lastPlayerBid : 0;
        const opponents = state.lot.opponents.map(({ id, name }): AuctionOpponentView => {
          if (state.phase === 'inspection') return { name, amount: null, state: 'waiting' };
          if (!state.activeOpponentIds.includes(id)) return { name, amount: null, state: 'out' };
          amount = advancePrice(amount);
          return { name, amount, state: id === state.leaderId ? 'leading' : 'bid' };
        });
        return { ...view, tier: state.tier, opponents };
      }
      return { ...view, tier: state.tier };
    }
  }
}
