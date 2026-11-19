import type { Command, GameState, GameView, VisibleItem } from './contract';

const tutorialLot = {
  openingBid: 20,
  bidIncrement: 5,
  opponentLimit: 25,
  items: [
    {
      id: 'bicycle',
      name: 'Велосипед',
      hint: {
        text: 'Рама потёрта. Если колёса ровные, велосипед ещё можно продать.',
        estimatedSalePrice: { min: 25, max: 40 },
      },
    },
    { id: 'box', name: 'Закрытая коробка', hint: null },
  ],
  finds: [
    { id: 'bicycle', name: 'Велосипед', salePrice: 35 },
    { id: 'tool', name: 'Инструмент из коробки', salePrice: 10 },
  ],
} as const satisfies GameState['lot'];

type OpenAuctionState = Extract<GameState, { phase: 'inspection' | 'bidding' }>;

function openLot(bank: number, revision: number, lotNumber: number): GameState {
  return { phase: 'inspection', bank, revision, lotNumber, lot: tutorialLot, inspectedItemIds: [] };
}

function nextBidAmount(state: OpenAuctionState): number {
  return state.phase === 'inspection' ? state.lot.openingBid : state.opponentBid + state.lot.bidIncrement;
}

export function newGame(): GameState {
  return openLot(100, 0, 1);
}

export function applyCommand(state: GameState, command: Command): GameState {
  if (command.expectedRevision !== state.revision) return state;

  const next = {
    bank: state.bank,
    revision: state.revision + 1,
    lotNumber: state.lotNumber,
    lot: state.lot,
    inspectedItemIds: state.inspectedItemIds,
  };

  switch (command.type) {
    case 'inspect': {
      if (state.phase !== 'inspection' && state.phase !== 'bidding') return state;
      const item = state.lot.items.find(({ id }) => id === command.itemId);
      if (!item?.hint || state.inspectedItemIds.includes(item.id)) return state;
      return { ...state, revision: next.revision, inspectedItemIds: [...state.inspectedItemIds, item.id] };
    }
    case 'bid': {
      if (state.phase !== 'inspection' && state.phase !== 'bidding') return state;
      const bid = nextBidAmount(state);
      if (bid > state.bank) return state;

      const opponentBid = bid + state.lot.bidIncrement;
      if (opponentBid <= state.lot.opponentLimit) {
        return { ...next, phase: 'bidding', lastPlayerBid: bid, opponentBid };
      }
      return { ...next, phase: 'reveal', bank: state.bank - bid, purchasePrice: bid };
    }
    case 'pass':
      if (state.phase !== 'inspection' && state.phase !== 'bidding') return state;
      return {
        ...next,
        phase: 'result',
        receipt: { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 },
      };
    case 'sellAll': {
      if (state.phase !== 'reveal') return state;
      const revenue = state.lot.finds.reduce((total, find) => total + find.salePrice, 0);
      return {
        ...next,
        phase: 'result',
        bank: state.bank + revenue,
        receipt: {
          outcome: 'sold',
          purchasePrice: state.purchasePrice,
          revenue,
          profit: revenue - state.purchasePrice,
        },
      };
    }
    case 'nextLot':
      if (state.phase !== 'result') return state;
      return openLot(state.bank, next.revision, state.lotNumber + 1);
  }
}

export function getView(state: GameState): GameView {
  const auctionOpen = state.phase === 'inspection' || state.phase === 'bidding';
  const visibleItems = state.lot.items.map(({ id, name, hint }): VisibleItem => {
    const inspected = state.inspectedItemIds.includes(id);
    return { id, name, hint: inspected ? hint : null, canInspect: auctionOpen && !inspected && hint !== null };
  });
  const base = { revision: state.revision, bank: state.bank, visibleItems };

  if (auctionOpen) {
    const amount = nextBidAmount(state);
    const allowedActions: ('inspect' | 'bid' | 'pass')[] = [];
    if (visibleItems.some(({ canInspect }) => canInspect)) allowedActions.push('inspect');
    if (amount <= state.bank) allowedActions.push('bid');
    allowedActions.push('pass');
    const auction = { ...base, nextBidAmount: amount, allowedActions };

    if (state.phase === 'inspection') {
      return { ...auction, phase: 'inspection', currentPrice: null, leadingBidder: null, lastPlayerBid: null };
    }
    return {
      ...auction,
      phase: 'bidding',
      currentPrice: state.opponentBid,
      leadingBidder: 'opponent',
      lastPlayerBid: state.lastPlayerBid,
    };
  }

  const closed = { ...base, nextBidAmount: null, currentPrice: null, leadingBidder: null, lastPlayerBid: null };
  if (state.phase === 'reveal') {
    return {
      ...closed,
      phase: 'reveal',
      allowedActions: ['sellAll'],
      purchasePrice: state.purchasePrice,
      revealedFinds: state.lot.finds,
    };
  }
  return { ...closed, phase: 'result', allowedActions: ['nextLot'], receipt: state.receipt };
}
