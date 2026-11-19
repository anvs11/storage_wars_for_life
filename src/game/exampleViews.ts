import type { GameView, VisibleItem } from './contract';

const bicycle: VisibleItem = {
  id: 'bicycle',
  name: 'Велосипед',
  canInspect: true,
  hint: null,
};

const box: VisibleItem = {
  id: 'box',
  name: 'Закрытая коробка',
  canInspect: false,
  hint: null,
};

const inspectedBicycle: VisibleItem = {
  ...bicycle,
  canInspect: false,
  hint: {
    text: 'Рама потёрта. Если колёса ровные, велосипед ещё можно продать.',
    estimatedSalePrice: { min: 25, max: 40 },
  },
};

const closedAuction = {
  currentPrice: null,
  leadingBidder: null,
  lastPlayerBid: null,
  nextBidAmount: null,
  visibleItems: [inspectedBicycle, box],
} as const;

export const inspectionView = {
  phase: 'inspection',
  revision: 0,
  bank: 100,
  currentPrice: null,
  leadingBidder: null,
  lastPlayerBid: null,
  nextBidAmount: 20,
  visibleItems: [bicycle, box],
  allowedActions: ['inspect', 'bid', 'pass'],
} as const satisfies GameView;

export const inspectedView = {
  ...inspectionView,
  revision: 1,
  visibleItems: [inspectedBicycle, box],
  allowedActions: ['bid', 'pass'],
} as const satisfies GameView;

// Ставка и ответ соперника составляют одно принятое действие.
export const opponentBidView = {
  phase: 'bidding',
  revision: 2,
  bank: 100,
  currentPrice: 25,
  leadingBidder: 'opponent',
  lastPlayerBid: 20,
  nextBidAmount: 30,
  visibleItems: [inspectedBicycle, box],
  allowedActions: ['bid', 'pass'],
} as const satisfies GameView;

export const revealView = {
  ...closedAuction,
  phase: 'reveal',
  revision: 3,
  bank: 70,
  allowedActions: ['sellAll'],
  purchasePrice: 30,
  revealedFinds: [
    { id: 'bicycle', name: 'Велосипед', salePrice: 35 },
    { id: 'tool', name: 'Инструмент из коробки', salePrice: 10 },
  ],
} as const satisfies GameView;

export const soldResultView = {
  ...closedAuction,
  phase: 'result',
  revision: 4,
  bank: 115,
  allowedActions: ['nextLot'],
  receipt: { outcome: 'sold', purchasePrice: 30, revenue: 45, profit: 15 },
} as const satisfies GameView;

export const passedResultView = {
  ...closedAuction,
  phase: 'result',
  revision: 3,
  bank: 100,
  allowedActions: ['nextLot'],
  receipt: { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 },
} as const satisfies GameView;
