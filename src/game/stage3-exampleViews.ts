import type { Stage3View } from './stage3-contract';

const ordinary = { tier: 'ordinary', title: 'Обычные торги', requiredStatus: 0, openingBid: 20, availability: 'ready' } as const;
const selected = { tier: 'selected', title: 'Отборные торги', requiredStatus: 8, openingBid: 50, availability: 'statusLocked' } as const;
const antique = { tier: 'antique', title: 'Антикварные торги', requiredStatus: 18, openingBid: 90, availability: 'statusLocked' } as const;

const diner = { id: 'diner', title: 'Закусочная', price: 5, statusGain: 1, requiredStatus: 0, availability: 'ready' } as const;
const dinerWithTip = { id: 'dinerWithTip', title: 'Закусочная с чаевыми', price: 7, statusGain: 2, requiredStatus: 0, availability: 'ready' } as const;
const cinema = { id: 'cinema', title: 'Кино', price: 10, statusGain: 2, requiredStatus: 8, availability: 'statusLocked' } as const;
const restaurant = { id: 'restaurant', title: 'Ресторан', price: 25, statusGain: 4, requiredStatus: 18, availability: 'statusLocked' } as const;
const theater = { id: 'theater', title: 'Театр', price: 20, statusGain: 3, requiredStatus: 18, availability: 'statusLocked' } as const;
const home = { id: 'home', title: 'Улучшение дома', price: 150, statusGain: 5, requiredStatus: 0, availability: 'fundsLocked' } as const;
const car = { id: 'car', title: 'Улучшение машины', price: 100, statusGain: 5, requiredStatus: 0, availability: 'ready' } as const;

const hub = {
  phase: 'hub',
  baggagePrice: 25,
  allowedActions: ['enterAuction', 'spend', 'callAirport'],
} as const;
const earlyHub = {
  ...hub,
  bank: 100,
  nextUnlock: { title: selected.title, requiredStatus: selected.requiredStatus },
  auctions: [ordinary, selected, antique],
  offers: [diner, dinerWithTip, cinema, restaurant, theater, home, car],
} as const;
const readyCinema = { ...cinema, availability: 'ready' } as const;
const selectedHub = {
  ...earlyHub,
  nextUnlock: { title: antique.title, requiredStatus: antique.requiredStatus },
  auctions: [ordinary, { ...selected, availability: 'ready' }, antique],
  offers: [diner, dinerWithTip, readyCinema, restaurant, theater, home, car],
} as const;
const readyRestaurant = { ...restaurant, availability: 'ready' } as const;
const readyTheater = { ...theater, availability: 'ready' } as const;
const antiqueHub = {
  ...selectedHub,
  bank: 160,
  nextUnlock: null,
  auctions: [ordinary, { ...selected, availability: 'ready' }, { ...antique, availability: 'ready' }],
  offers: [diner, dinerWithTip, readyCinema, readyRestaurant, readyTheater, { ...home, availability: 'ready' }, car],
} as const;

const inspection = {
  phase: 'inspection',
  currentPrice: null,
  leadingBidder: null,
  lastPlayerBid: null,
  allowedActions: ['inspect', 'bid', 'pass'],
} as const;

const baggagePrice = hub.baggagePrice;
const airport = { phase: 'airportOffer', price: baggagePrice } as const;
const baggageInventory = { phase: 'baggageInventory', bank: 75, purchasePrice: baggagePrice, revenue: 0 } as const;
const baggageRevealed = {
  ...baggageInventory,
  revision: 32,
  sealedBoxes: [],
  allowedActions: ['sellItem', 'sellAll'],
} as const;
const baggageResult = { phase: 'baggageResult', revision: 33, allowedActions: ['returnToHub'] } as const;

// Снимки заданы вручную для проверки интерфейса.
export const stage3Views = {
  hubStart: { ...earlyHub, revision: 16, status: 0 },
  hubNearUnlock: { ...earlyHub, revision: 24, status: 7 },
  hubSelected: { ...selectedHub, revision: 25, status: 8 },
  hubNearAntique: { ...selectedHub, revision: 35, status: 17 },
  hubAntique: { ...antiqueHub, revision: 36, status: 18 },
  hubLowBank: {
    ...hub,
    revision: 25,
    bank: 19,
    status: 8,
    nextUnlock: selectedHub.nextUnlock,
    auctions: [{ ...ordinary, availability: 'recovery' }, { ...selected, availability: 'fundsLocked' }, antique],
    offers: [diner, dinerWithTip, readyCinema, restaurant, theater, home, { ...car, availability: 'fundsLocked' }],
  },
  hubOwned: {
    ...antiqueHub,
    revision: 45,
    bank: 100,
    status: 28,
    offers: [
      diner, dinerWithTip, readyCinema, readyRestaurant, readyTheater,
      { ...home, availability: 'owned' }, { ...car, availability: 'owned' },
    ],
  },
  selectedInspection: {
    ...inspection,
    revision: 26,
    bank: 100,
    lotNumber: 2,
    tier: 'selected',
    sceneId: 'selected',
    nextBidAmount: 50,
    visibleItems: [
      { id: 'selected-turntable', name: 'Проигрыватель', hint: null, canInspect: true },
      { id: 'selected-lamp', name: 'Напольный светильник', hint: null, canInspect: true },
      { id: 'selected-box', name: 'Закрытая коробка', hint: null, canInspect: false },
    ],
  },
  antiqueInspection: {
    ...inspection,
    revision: 38,
    bank: 160,
    lotNumber: 3,
    tier: 'antique',
    sceneId: 'antiques',
    nextBidAmount: 90,
    visibleItems: [
      {
        id: 'antique-vase',
        name: 'Керамическая ваза',
        hint: { text: 'Чёткое клеймо под глазурью, на горлышке мелкий скол.', estimatedSalePrice: { min: 45, max: 75 } },
        canInspect: false,
      },
      { id: 'antique-clock', name: 'Каминные часы', hint: null, canInspect: true },
      { id: 'antique-box-1', name: 'Малая закрытая коробка', hint: null, canInspect: false },
      { id: 'antique-box-2', name: 'Большая закрытая коробка', hint: null, canInspect: false },
    ],
  },
  airportOffer: { ...airport, revision: 30, bank: 100, canAfford: true, allowedActions: ['buyBaggage', 'returnToHub'] },
  airportUnaffordable: { ...airport, revision: 26, bank: 19, canAfford: false, allowedActions: ['returnToHub'] },
  baggageSealed: {
    ...baggageInventory,
    revision: 31,
    sealedBoxes: [{ id: 'suitcase', name: 'Закрытый чемодан' }],
    revealedFinds: [],
    allowedActions: ['openBox'],
  },
  baggageRevealedLow: {
    ...baggageRevealed,
    revealedFinds: [{ id: 'suitcase-find', name: 'Потёртый дорожный набор', salePrice: 4 }],
  },
  baggageRevealedHigh: {
    ...baggageRevealed,
    revealedFinds: [{ id: 'suitcase-find', name: 'Винтажный фотоаппарат', salePrice: 60 }],
  },
  baggageResultLow: {
    ...baggageResult,
    bank: 79,
    receipt: { outcome: 'sold', purchasePrice: baggagePrice, revenue: 4, profit: -21 },
  },
  baggageResultHigh: {
    ...baggageResult,
    bank: 135,
    receipt: { outcome: 'sold', purchasePrice: baggagePrice, revenue: 60, profit: 35 },
  },
} as const satisfies Record<string, Stage3View>;
