import { createLot } from './catalog';
import type { GarageLot, LotFind } from './catalog';
import type { ItemId, PassedReceipt, SoldReceipt, VisibleItem } from './contract';
import type { Stage2Command, Stage2View } from './stage2-contract';

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

interface LotSnapshot {
  readonly lotNumber: number;
  readonly lot: GarageLot;
  readonly inspectedItemIds: readonly ItemId[];
  readonly activeOpponentIds: readonly string[];
}

interface Inventory {
  readonly openedBoxIds: readonly ItemId[];
  readonly soldItemIds: readonly ItemId[];
}

export type Stage2State = Profile & (
  | { readonly phase: 'prologue'; readonly storyIndex: 0 | typeof nextStoryFrame[number] }
  | (LotSnapshot & (
      | { readonly phase: 'inspection' }
      | { readonly phase: 'recovery' }
      | {
          readonly phase: 'bidding';
          readonly opponentBid: number;
          readonly leaderId: string;
          readonly lastPlayerBid: number;
        }
      | (Inventory & { readonly phase: 'reveal'; readonly purchasePrice: number })
      | (Inventory & { readonly phase: 'result'; readonly receipt: SoldReceipt | PassedReceipt })
    ))
);

type AuctionState = Extract<Stage2State, { phase: 'inspection' | 'bidding' }>;
type RevealState = Extract<Stage2State, { phase: 'reveal' }>;

const emptyInventory = { openedBoxIds: [], soldItemIds: [] } as const;

export function newGame(): Stage2State {
  return { phase: 'prologue', storyIndex: 0, revision: 0, bank: 0, status: 0 };
}

function enterLot(profile: Profile, lotNumber: number): Stage2State {
  const lot = createLot(lotNumber);
  return {
    ...profile,
    phase: profile.bank < lot.openingBid ? 'recovery' : 'inspection',
    lot,
    lotNumber,
    inspectedItemIds: [],
    activeOpponentIds: lot.opponents.map(({ id }) => id),
  };
}

function nextBid(state: AuctionState): number {
  return state.phase === 'bidding' ? state.opponentBid + state.lot.bidIncrement : state.lot.openingBid;
}

function inventory(state: RevealState) {
  const { boxes, visibleFinds } = state.lot;
  const sealedBoxes = boxes.filter(({ id }) => !state.openedBoxIds.includes(id));
  const openedFinds = boxes.filter(({ id }) => state.openedBoxIds.includes(id)).flatMap(({ contents }) => contents);
  const finds = [...visibleFinds, ...openedFinds];
  const available = finds.filter(({ id }) => !state.soldItemIds.includes(id));
  const revenue = finds.reduce((total, { id, salePrice }) => (
    state.soldItemIds.includes(id) ? total + salePrice : total
  ), 0);
  return { sealedBoxes, available, revenue };
}

function acceptBid(state: AuctionState, next: Profile & LotSnapshot): Stage2State {
  const bid = nextBid(state);
  if (bid > state.bank) return state;

  let price = bid;
  const activeOpponentIds: string[] = [];
  for (const opponent of state.lot.opponents) {
    const counter = price + state.lot.bidIncrement;
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

function totalPrice(finds: readonly LotFind[]): number {
  return finds.reduce((sum, { salePrice }) => sum + salePrice, 0);
}

export function applyCommand(state: Stage2State, command: Stage2Command): Stage2State {
  if (state.revision !== command.expectedRevision) return state;

  const profile = { bank: state.bank, status: state.status, revision: state.revision + 1 };
  if (state.phase === 'prologue') {
    if (command.type === 'skipStory' || (command.type === 'confirmRent' && state.storyIndex === rentFrame)) {
      return enterLot({ ...profile, bank: grant - rent }, 1);
    }
    if (command.type === 'storyNext' && state.storyIndex !== rentFrame) {
      return { ...state, revision: profile.revision, storyIndex: nextStoryFrame[state.storyIndex] };
    }
    return state;
  }

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
      return auctionOpen ? acceptBid(state, next) : state;
    case 'pass':
      if (!auctionOpen) return state;
      return {
        ...next,
        ...emptyInventory,
        phase: 'result',
        receipt: { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 },
      };
    case 'openBox':
      if (state.phase !== 'reveal' || state.openedBoxIds.includes(command.boxId)) return state;
      if (!state.lot.boxes.some(({ id }) => id === command.boxId)) return state;
      return { ...state, revision: profile.revision, openedBoxIds: [...state.openedBoxIds, command.boxId] };
    case 'sellAll':
    case 'sellItem': {
      if (state.phase !== 'reveal') return state;
      const { sealedBoxes, available, revenue } = inventory(state);
      if (command.type === 'sellAll' && sealedBoxes.length > 0) return state;
      const sales = command.type === 'sellAll' ? available : available.filter(({ id }) => id === command.itemId);
      if (sales.length === 0) return state;

      const proceeds = totalPrice(sales);
      const updated = {
        ...next,
        bank: state.bank + proceeds,
        openedBoxIds: state.openedBoxIds,
        soldItemIds: [...state.soldItemIds, ...sales.map(({ id }) => id)],
      };
      const { purchasePrice } = state;
      if (sealedBoxes.length > 0 || sales.length < available.length) {
        return { ...updated, phase: 'reveal', purchasePrice };
      }
      const finalRevenue = revenue + proceeds;
      const profit = finalRevenue - purchasePrice;
      return {
        ...updated,
        phase: 'result',
        status: state.status + (profit > 0 ? 2 : 0),
        receipt: { outcome: 'sold', purchasePrice, revenue: finalRevenue, profit },
      };
    }
    case 'nextLot':
      return state.phase === 'result' ? enterLot(profile, state.lotNumber + 1) : state;
    default:
      return state;
  }
}

export function getView(state: Stage2State): Stage2View {
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
    const nextBidAmount = nextBid(state);
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
    const { sealedBoxes, available, revenue } = inventory(state);
    const allowedActions: ('openBox' | 'sellItem' | 'sellAll')[] = [];
    if (sealedBoxes.length > 0) allowedActions.push('openBox');
    if (available.length > 0) {
      allowedActions.push('sellItem');
      if (sealedBoxes.length === 0) allowedActions.push('sellAll');
    }
    return {
      ...closed,
      phase: 'reveal',
      purchasePrice: state.purchasePrice,
      revenue,
      sealedBoxes: sealedBoxes.map(({ id, name }) => ({ id, name })),
      revealedFinds: available.map(({ id, name, salePrice }) => ({ id, name, salePrice })),
      allowedActions,
    };
  }
  return { ...closed, phase: 'result', receipt: state.receipt, allowedActions: ['nextLot'] };
}
