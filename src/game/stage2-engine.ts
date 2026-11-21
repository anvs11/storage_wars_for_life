import { createLot } from './catalog';
import type { GarageLot } from './catalog';
import { emptyInventory, interactWithInventory, inventoryView } from './inventory';
import type { InventoryProgress } from './inventory';
import type { ItemId, PassedReceipt, SoldReceipt, VisibleItem } from './contract';
import type { Stage2Command, Stage2Scene, Stage2View } from './stage2-contract';

const grant = 200;
const rent = 100;
const rentalWeeks = 2;
const storyFrames = [
  { step: 'door' },
  { step: 'rain' },
  { step: 'dialogue', line: 0 },
  { step: 'dialogue', line: 1 },
  { step: 'dialogue', line: 2 },
  { step: 'dialogue', line: 3 },
  { step: 'dialogue', line: 4 },
  { step: 'dialogue', line: 5 },
  { step: 'rent', grant, rent, remaining: grant - rent, rentalWeeks },
] as const;
const nextStoryFrame = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const rentFrame = 8;

interface Profile {
  readonly revision: number;
  readonly bank: number;
  readonly status: number;
}

interface LotSnapshot<Scene extends string> {
  readonly lotNumber: number;
  readonly lot: GarageLot<Scene>;
  readonly inspectedItemIds: readonly ItemId[];
  readonly activeOpponentIds: readonly string[];
}

export type Stage2State<Scene extends string = Stage2Scene> = Profile & (
  | { readonly phase: 'prologue'; readonly storyIndex: 0 | typeof nextStoryFrame[number] }
  | (LotSnapshot<Scene> & (
      | { readonly phase: 'inspection' }
      | { readonly phase: 'recovery' }
      | {
          readonly phase: 'bidding';
          readonly opponentBid: number;
          readonly leaderId: string;
          readonly lastPlayerBid: number;
        }
      | (InventoryProgress & { readonly phase: 'reveal'; readonly purchasePrice: number })
      | (InventoryProgress & { readonly phase: 'result'; readonly receipt: SoldReceipt | PassedReceipt })
    ))
);

export type GarageState<Scene extends string = Stage2Scene> = Exclude<Stage2State<Scene>, { phase: 'prologue' }>;
type PrologueState = Extract<Stage2State, { phase: 'prologue' }>;
type BiddingState<Scene extends string> = Extract<GarageState<Scene>, { phase: 'inspection' | 'bidding' }>;
type AdvancePrice = (price: number) => number;

export const initialPrologue = { phase: 'prologue', storyIndex: 0, revision: 0, bank: 0, status: 0 } as const satisfies PrologueState;

export function newGame(): Stage2State {
  return { ...initialPrologue };
}

export function enterLot<Scene extends string>(profile: Profile, lotNumber: number, lot: GarageLot<Scene>): GarageState<Scene> {
  return {
    ...profile,
    phase: profile.bank < lot.openingBid ? 'recovery' : 'inspection',
    lot,
    lotNumber,
    inspectedItemIds: [],
    activeOpponentIds: lot.opponents.map(({ id }) => id),
  };
}

function nextBid<Scene extends string>(state: BiddingState<Scene>, advancePrice: AdvancePrice): number {
  return state.phase === 'bidding' ? advancePrice(state.opponentBid) : state.lot.openingBid;
}

function acceptBid<Scene extends string>(
  state: BiddingState<Scene>, next: Profile & LotSnapshot<Scene>, advancePrice: AdvancePrice,
): GarageState<Scene> {
  const bid = nextBid(state, advancePrice);
  if (bid > state.bank) return state;

  let price = bid;
  const activeOpponentIds: string[] = [];
  for (const opponent of state.lot.opponents) {
    const counter = advancePrice(price);
    if (!state.activeOpponentIds.includes(opponent.id) || counter > opponent.limit) continue;
    price = counter;
    activeOpponentIds.push(opponent.id);
  }

  const leaderId = activeOpponentIds.at(-1);
  if (leaderId !== undefined) {
    return { ...next, phase: 'bidding', activeOpponentIds, leaderId, lastPlayerBid: bid, opponentBid: price };
  }
  return {
    ...next,
    ...emptyInventory,
    phase: 'reveal',
    activeOpponentIds,
    bank: state.bank - bid,
    purchasePrice: bid,
  };
}

export function applyStoryCommand(state: PrologueState, command: Stage2Command): Stage2State {
  if (state.revision !== command.expectedRevision) return state;
  const revision = state.revision + 1;
  if (command.type === 'skipStory' || (command.type === 'confirmRent' && state.storyIndex === rentFrame)) {
    return enterLot({ bank: grant - rent, status: state.status, revision }, 1, createLot(1));
  }
  if (command.type === 'storyNext' && state.storyIndex !== rentFrame) {
    return { ...state, revision, storyIndex: nextStoryFrame[state.storyIndex] };
  }
  return state;
}

export function applyCommand(state: Stage2State, command: Stage2Command): Stage2State {
  if (state.phase === 'prologue') return applyStoryCommand(state, command);
  if (state.revision !== command.expectedRevision) return state;
  if (command.type === 'nextLot' && state.phase === 'result') {
    const lotNumber = state.lotNumber + 1;
    const profile = { bank: state.bank, status: state.status, revision: state.revision + 1 };
    return enterLot(profile, lotNumber, createLot(lotNumber));
  }
  return applyGarageCommand(state, command);
}

export function applyGarageCommand<Scene extends string>(
  state: GarageState<Scene>, command: Stage2Command, advancePrice: AdvancePrice = (price) => price + state.lot.bidIncrement,
): GarageState<Scene> {
  if (state.revision !== command.expectedRevision) return state;
  const profile = { bank: state.bank, status: state.status, revision: state.revision + 1 };
  const next = {
    ...profile,
    lot: state.lot,
    lotNumber: state.lotNumber,
    inspectedItemIds: state.inspectedItemIds,
    activeOpponentIds: state.activeOpponentIds,
  };
  const auctionOpen = state.phase === 'inspection' || state.phase === 'bidding';
  switch (command.type) {
    case 'sortGarage':
      if (state.phase !== 'recovery') return state;
      return { ...next, phase: 'inspection', bank: state.lot.openingBid };
    case 'inspect': {
      if (!auctionOpen || state.inspectedItemIds.includes(command.itemId)) return state;
      if (!state.lot.visibleFinds.some(({ id }) => id === command.itemId)) return state;
      return { ...state, revision: profile.revision, inspectedItemIds: [...state.inspectedItemIds, command.itemId] };
    }
    case 'bid':
      return auctionOpen ? acceptBid(state, next, advancePrice) : state;
    case 'pass':
      if (!auctionOpen) return state;
      return {
        ...next,
        ...emptyInventory,
        phase: 'result',
        receipt: { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 },
      };
    case 'openBox':
    case 'sellAll':
    case 'sellItem': {
      if (state.phase !== 'reveal') return state;
      const update = interactWithInventory(state.lot, state, command);
      if (!update) return state;
      const bank = state.bank + update.proceeds;
      if (!update.receipt) {
        return { ...state, bank, revision: profile.revision, ...update.inventory };
      }
      return {
        ...next,
        phase: 'result',
        ...update.inventory,
        bank,
        status: state.status + (update.receipt.profit > 0 ? 2 : 0),
        receipt: update.receipt,
      };
    }
    default:
      return state;
  }
}

export function getView(state: Extract<Stage2State, { phase: 'prologue' }>): Extract<Stage2View, { phase: 'prologue' }>;
export function getView<Scene extends string>(state: Stage2State<Scene>, advancePrice?: AdvancePrice): Stage2View<Scene>;
export function getView<Scene extends string>(
  state: Stage2State<Scene>,
  advancePrice: AdvancePrice = (price) => price + ('lot' in state ? state.lot.bidIncrement : 5),
): Stage2View<Scene> {
  const { revision, bank, phase } = state;
  if (phase === 'prologue') {
    const story = storyFrames[state.storyIndex];
    const allowedActions = story.step === 'rent' ? ['confirmRent', 'skipStory'] as const : ['storyNext', 'skipStory'] as const;
    return { phase, revision, bank, story, allowedActions };
  }
  if (phase === 'recovery') {
    const minimumBid = state.lot.openingBid;
    return { phase, revision, bank, minimumBid, reward: minimumBid - bank, allowedActions: ['sortGarage'] };
  }

  const auctionOpen = phase === 'inspection' || phase === 'bidding';
  const visibleItems: VisibleItem[] = state.lot.visibleFinds.map(({ id, name, hint }) => {
    const inspected = state.inspectedItemIds.includes(id);
    return { id, name, hint: inspected ? hint : null, canInspect: auctionOpen && !inspected };
  });
  for (const { id, name } of state.lot.boxes) {
    visibleItems.push({ id, name, hint: null, canInspect: false });
  }
  const base = { revision, bank, visibleItems, lotNumber: state.lotNumber, sceneId: state.lot.sceneId };

  if (auctionOpen) {
    const nextBidAmount = nextBid(state, advancePrice);
    const allowedActions: ('inspect' | 'bid' | 'pass')[] = [];
    if (visibleItems.some(({ canInspect }) => canInspect)) allowedActions.push('inspect');
    if (nextBidAmount <= bank) allowedActions.push('bid');
    allowedActions.push('pass');
    const open = { ...base, nextBidAmount, allowedActions };

    if (state.phase === 'bidding') {
      return {
        ...open,
        phase: 'bidding',
        currentPrice: state.opponentBid,
        lastPlayerBid: state.lastPlayerBid,
        leadingBidder: 'opponent',
        leaderName: state.lot.opponents.find(({ id }) => id === state.leaderId)?.name ?? '',
      };
    }
    return { ...open, phase: 'inspection', currentPrice: null, lastPlayerBid: null, leadingBidder: null };
  }

  const closed = { ...base, currentPrice: null, lastPlayerBid: null, leadingBidder: null, nextBidAmount: null };
  if (state.phase === 'reveal') {
    return {
      ...closed,
      phase: 'reveal',
      ...inventoryView(state.lot, state),
    };
  }
  return { ...closed, phase: 'result', receipt: state.receipt, allowedActions: ['nextLot'] };
}
