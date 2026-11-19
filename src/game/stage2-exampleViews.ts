import type { Stage2View } from './stage2-contract';

const prologue = {
  phase: 'prologue',
  bank: 0,
  allowedActions: ['storyNext', 'skipStory'],
} as const;

const tutorial = { lotNumber: 1, sceneId: 'tutorial' } as const;
const bicycle = { id: 'bicycle', name: 'Велосипед' } as const;
const box = { id: 'box', name: 'Закрытая коробка' } as const;
const visibleBox = { ...box, hint: null, canInspect: false } as const;
const inspectedItems = [
  {
    ...bicycle,
    canInspect: false,
    hint: {
      text: 'Рама потёрта. Если колёса ровные, велосипед ещё можно продать.',
      estimatedSalePrice: { min: 25, max: 40 },
    },
  },
  visibleBox,
] as const;
const closedAuction = {
  ...tutorial,
  visibleItems: inspectedItems,
  currentPrice: null,
  leadingBidder: null,
  lastPlayerBid: null,
  nextBidAmount: null,
} as const;
const reveal = { ...closedAuction, phase: 'reveal', purchasePrice: 30 } as const;
const result = { ...closedAuction, phase: 'result', allowedActions: ['nextLot'] } as const;

// Сценарии для просмотра экранов заданы вручную.
export const stage2Views = {
  door: {
    ...prologue,
    revision: 0,
    story: { step: 'door' },
  },
  rain: {
    ...prologue,
    revision: 1,
    story: { step: 'rain' },
  },
  dialogue: {
    ...prologue,
    revision: 2,
    story: { step: 'dialogue', line: 0 },
  },
  rent: {
    ...prologue,
    revision: 8,
    story: { step: 'rent', grant: 200, rent: 100, remaining: 100, rentalWeeks: 2 },
    allowedActions: ['confirmRent', 'skipStory'],
  },
  inspection: {
    ...tutorial,
    phase: 'inspection',
    revision: 9,
    bank: 100,
    currentPrice: null,
    leadingBidder: null,
    lastPlayerBid: null,
    nextBidAmount: 20,
    visibleItems: [{ ...bicycle, canInspect: true, hint: null }, visibleBox],
    allowedActions: ['inspect', 'bid', 'pass'],
  },
  bidding: {
    ...tutorial,
    phase: 'bidding',
    revision: 11,
    bank: 100,
    currentPrice: 25,
    leadingBidder: 'opponent',
    leaderName: 'Виктор',
    lastPlayerBid: 20,
    nextBidAmount: 30,
    visibleItems: inspectedItems,
    allowedActions: ['bid', 'pass'],
  },
  revealSealed: {
    ...reveal,
    revision: 12,
    bank: 70,
    revenue: 0,
    sealedBoxes: [box],
    revealedFinds: [{ ...bicycle, salePrice: 35 }],
    allowedActions: ['openBox', 'sellItem'],
  },
  revealPartial: {
    ...reveal,
    revision: 14,
    bank: 105,
    revenue: 35,
    sealedBoxes: [],
    revealedFinds: [{ id: 'tool', name: 'Инструмент из коробки', salePrice: 10 }],
    allowedActions: ['sellItem', 'sellAll'],
  },
  sold: {
    ...result,
    revision: 15,
    bank: 115,
    receipt: { outcome: 'sold', purchasePrice: 30, revenue: 45, profit: 15 },
  },
  passed: {
    ...result,
    revision: 12,
    bank: 100,
    receipt: { outcome: 'passed', purchasePrice: 0, revenue: 0, profit: 0 },
  },
  recovery: {
    phase: 'recovery',
    revision: 19,
    bank: 15,
    minimumBid: 20,
    reward: 5,
    allowedActions: ['sortGarage'],
  },
} as const satisfies Record<string, Stage2View>;
