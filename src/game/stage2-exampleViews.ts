import {
  inspectionView,
  opponentBidView,
  passedResultView,
  revealView,
  soldResultView,
} from './exampleViews';
import type { Stage2View } from './stage2-contract';

const prologue = {
  phase: 'prologue',
  bank: 0,
  allowedActions: ['storyNext', 'skipStory'],
} as const;

const tutorial = { lotNumber: 1, sceneId: 'tutorial' } as const;
const [bicycle, tool] = revealView.revealedFinds;

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
    ...inspectionView,
    ...tutorial,
    revision: 9,
  },
  bidding: {
    ...opponentBidView,
    ...tutorial,
    revision: 11,
    leaderName: 'Виктор',
  },
  revealSealed: {
    ...revealView,
    ...tutorial,
    revision: 12,
    revenue: 0,
    sealedBoxes: [{ id: 'box', name: 'Закрытая коробка' }],
    revealedFinds: [bicycle],
    allowedActions: ['openBox', 'sellItem'],
  },
  revealPartial: {
    ...revealView,
    ...tutorial,
    revision: 14,
    bank: 105,
    revenue: 35,
    sealedBoxes: [],
    revealedFinds: [tool],
    allowedActions: ['sellItem', 'sellAll'],
  },
  sold: {
    ...soldResultView,
    ...tutorial,
    revision: 15,
  },
  passed: {
    ...passedResultView,
    ...tutorial,
    revision: 12,
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
