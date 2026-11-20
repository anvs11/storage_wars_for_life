import { stage2Views } from '../game/stage2-exampleViews';
import type { Stage3Command, Stage3View } from '../game/stage3-contract';
import { stage3Views } from '../game/stage3-exampleViews';
import { mountStage3 } from './mount';

const ordinary = { tier: 'ordinary' } as const;
const { inspection, bidding, revealSealed, revealPartial } = stage2Views;
const { selectedInspection, antiqueInspection } = stage3Views;
const selectedHints = [
  {
    ...selectedInspection.visibleItems[0], canInspect: false,
    hint: { text: 'Игла на месте, диск вращается свободно.', estimatedSalePrice: { min: 35, max: 70 } },
  },
  {
    ...selectedInspection.visibleItems[1], canInspect: false,
    hint: { text: 'Плафон цел, провод у основания потёрт.', estimatedSalePrice: { min: 10, max: 25 } },
  },
  selectedInspection.visibleItems[2],
] as const;
const antiqueHints = [
  antiqueInspection.visibleItems[0],
  {
    ...antiqueInspection.visibleItems[1], canInspect: false,
    hint: { text: 'Маятник на месте, стекло циферблата треснуло.', estimatedSalePrice: { min: 20, max: 45 } },
  },
  ...antiqueInspection.visibleItems.slice(2),
] as const;
const selectedBidding = {
  ...selectedInspection, phase: 'bidding', revision: 28, currentPrice: 60, leadingBidder: 'opponent',
  leaderName: 'Марина', lastPlayerBid: 50, nextBidAmount: 70,
} as const;
const antiqueBidding = {
  ...antiqueInspection, phase: 'bidding', revision: 40, currentPrice: 100, leadingBidder: 'opponent',
  leaderName: 'Виктория', lastPlayerBid: 90, nextBidAmount: 115,
} as const;
const selectedLocation = { tier: 'selected', sceneId: 'selected', lotNumber: 2 } as const;
const antiqueLocation = { tier: 'antique', sceneId: 'antiques', lotNumber: 3 } as const;
const selectedFinds = [
  { id: 'selected-turntable', name: 'Проигрыватель', salePrice: 57 },
  { id: 'selected-lamp', name: 'Напольный светильник', salePrice: 15 },
  { id: 'selected-records', name: 'Набор пластинок', salePrice: 10 },
] as const;
const antiqueFinds = [
  { id: 'antique-vase', name: 'Керамическая ваза', salePrice: 57 },
  { id: 'antique-clock', name: 'Каминные часы', salePrice: 29 },
  { id: 'antique-stand', name: 'Деревянная подставка', salePrice: 8 },
] as const;

// В дорогих лотах используются короткие маршруты к продаже остатка.
const openedLot = {
  ...revealPartial, visibleItems: [], revenue: 0, allowedActions: ['sellAll'],
} as const;
const selectedPurchase = { ...openedLot, ...selectedLocation, purchasePrice: 70, bank: 30 } as const;
const antiquePurchase = { ...openedLot, ...antiqueLocation, purchasePrice: 115, bank: 45 } as const;
const smallBox = { id: 'antique-box-1', name: 'Малая закрытая коробка' };
const largeBox = { id: 'antique-box-2', name: 'Большая закрытая коробка' };

const examples = {
  ...stage3Views,
  door: stage2Views.door,
  rain: stage2Views.rain,
  dialogue: stage2Views.dialogue,
  dialogue2: { ...stage2Views.dialogue, revision: 3, story: { step: 'dialogue', line: 1 } },
  dialogue3: { ...stage2Views.dialogue, revision: 4, story: { step: 'dialogue', line: 2 } },
  dialogue4: { ...stage2Views.dialogue, revision: 5, story: { step: 'dialogue', line: 3 } },
  dialogue5: { ...stage2Views.dialogue, revision: 6, story: { step: 'dialogue', line: 4 } },
  dialogue6: { ...stage2Views.dialogue, revision: 7, story: { step: 'dialogue', line: 5 } },
  rent: stage2Views.rent,
  ordinaryInspection: { ...inspection, ...ordinary },
  ordinaryInspected: { ...inspection, ...ordinary, revision: 10, visibleItems: bidding.visibleItems, allowedActions: ['bid', 'pass'] },
  ordinaryBidding: { ...bidding, ...ordinary },
  ordinaryBiddingUninspected: { ...bidding, ...ordinary, visibleItems: inspection.visibleItems, allowedActions: ['inspect', 'bid', 'pass'] },
  ordinaryReveal: { ...revealSealed, ...ordinary },
  ordinaryOpened: {
    ...revealSealed, ...ordinary, revision: 13, sealedBoxes: [],
    revealedFinds: [...revealSealed.revealedFinds, ...revealPartial.revealedFinds],
    allowedActions: ['sellItem', 'sellAll'],
  },
  ordinarySoldVisible: { ...revealSealed, ...ordinary, revision: 13, revenue: 35, bank: 105, revealedFinds: [], allowedActions: ['openBox'] },
  ordinarySoldTool: { ...revealSealed, ...ordinary, revision: 14, revenue: 10, bank: 80, sealedBoxes: [], allowedActions: ['sellItem', 'sellAll'] },
  ordinaryPartial: { ...revealPartial, ...ordinary },
  ordinarySold: { ...stage2Views.sold, ...ordinary },
  ordinaryPassed: { ...stage2Views.passed, ...ordinary },
  hubAfterTutorial: { ...stage3Views.hubStart, revision: 16, bank: 115, status: 2 },
  recovery: { ...stage2Views.recovery, bank: 19, reward: 1 },
  recoveredInspection: { ...inspection, ...ordinary, bank: 20 },
  recoveredBidding: { ...bidding, ...ordinary, bank: 20, allowedActions: ['pass'] },
  recoveredPassed: { ...stage2Views.passed, ...ordinary, bank: 20 },
  selectedInspected: {
    ...selectedInspection, revision: 27, allowedActions: ['bid', 'pass'],
    visibleItems: selectedHints,
  },
  antiqueInspected: {
    ...antiqueInspection, revision: 39, allowedActions: ['bid', 'pass'],
    visibleItems: antiqueHints,
  },
  selectedBidding,
  selectedBiddingInspected: { ...selectedBidding, revision: 29, visibleItems: selectedHints, allowedActions: ['bid', 'pass'] },
  antiqueBidding,
  antiqueBiddingInspected: { ...antiqueBidding, revision: 41, visibleItems: antiqueHints, allowedActions: ['bid', 'pass'] },
  selectedSealed: {
    ...selectedPurchase, revision: 30, revealedFinds: selectedFinds.slice(0, 2),
    sealedBoxes: [{ id: 'selected-box', name: 'Закрытая коробка' }], allowedActions: ['openBox'],
  },
  selectedOpened: { ...selectedPurchase, revision: 32, revealedFinds: selectedFinds },
  antiqueSealed: {
    ...antiquePurchase, revision: 42, revealedFinds: antiqueFinds.slice(0, 2),
    sealedBoxes: [smallBox, largeBox], allowedActions: ['openBox'],
  },
  antiqueSmallOpened: {
    ...antiquePurchase, revision: 44, revealedFinds: antiqueFinds.slice(0, 2),
    sealedBoxes: [largeBox], allowedActions: ['openBox'],
  },
  antiqueLargeOpened: {
    ...antiquePurchase, revision: 44, revealedFinds: antiqueFinds,
    sealedBoxes: [smallBox], allowedActions: ['openBox'],
  },
  antiqueOpened: { ...antiquePurchase, revision: 45, revealedFinds: antiqueFinds },
  selectedSold: {
    ...stage2Views.sold, ...selectedLocation, revision: 33, bank: 112, visibleItems: [],
    receipt: { outcome: 'sold', purchasePrice: 70, revenue: 82, profit: 12 },
  },
  antiqueSold: {
    ...stage2Views.sold, ...antiqueLocation, revision: 46, bank: 139, visibleItems: [],
    receipt: { outcome: 'sold', purchasePrice: 115, revenue: 94, profit: -21 },
  },
  selectedPassed: { ...stage2Views.passed, ...selectedLocation, revision: 30, visibleItems: [] },
  antiquePassed: { ...stage2Views.passed, ...antiqueLocation, revision: 42, bank: 160, visibleItems: [] },
  hubAfterSelected: { ...stage3Views.hubSelected, revision: 34, bank: 112, status: 10 },
  hubAfterAntique: { ...stage3Views.hubAntique, revision: 47, bank: 139 },
} as const satisfies Record<string, Stage3View>;

type Example = keyof typeof examples;
type CommandType = Stage3Command['type'];
type Route = Partial<Record<CommandType, Example>>;

const routes: Partial<Record<Example, Route>> = {
  door: { storyNext: 'rain' },
  rain: { storyNext: 'dialogue' },
  dialogue: { storyNext: 'dialogue2' },
  dialogue2: { storyNext: 'dialogue3' },
  dialogue3: { storyNext: 'dialogue4' },
  dialogue4: { storyNext: 'dialogue5' },
  dialogue5: { storyNext: 'dialogue6' },
  dialogue6: { storyNext: 'rent' },
  rent: { confirmRent: 'ordinaryInspection' },
  ordinaryInspection: { inspect: 'ordinaryInspected', bid: 'ordinaryBiddingUninspected', pass: 'ordinaryPassed' },
  ordinaryInspected: { bid: 'ordinaryBidding', pass: 'ordinaryPassed' },
  ordinaryBiddingUninspected: { inspect: 'ordinaryBidding', bid: 'ordinaryReveal', pass: 'ordinaryPassed' },
  ordinaryBidding: { bid: 'ordinaryReveal', pass: 'ordinaryPassed' },
  ordinaryReveal: { openBox: 'ordinaryOpened', sellItem: 'ordinarySoldVisible' },
  ordinarySoldVisible: { openBox: 'ordinaryPartial' },
  ordinarySoldTool: { sellItem: 'ordinarySold', sellAll: 'ordinarySold' },
  ordinaryPartial: { sellItem: 'ordinarySold', sellAll: 'ordinarySold' },
  ordinarySold: { nextLot: 'hubAfterTutorial' },
  ordinaryPassed: { nextLot: 'hubStart' },
  recovery: { sortGarage: 'recoveredInspection' },
  recoveredInspection: { bid: 'recoveredBidding', pass: 'recoveredPassed' },
  recoveredBidding: { pass: 'recoveredPassed' },
  recoveredPassed: { nextLot: 'hubLowBank' },
  selectedInspection: { inspect: 'selectedInspected', bid: 'selectedBidding', pass: 'selectedPassed' },
  selectedInspected: { bid: 'selectedBiddingInspected', pass: 'selectedPassed' },
  selectedBidding: { inspect: 'selectedBiddingInspected', bid: 'selectedSealed', pass: 'selectedPassed' },
  selectedBiddingInspected: { bid: 'selectedSealed', pass: 'selectedPassed' },
  selectedSealed: { openBox: 'selectedOpened' },
  selectedOpened: { sellAll: 'selectedSold' },
  selectedSold: { nextLot: 'hubAfterSelected' },
  antiqueInspection: { inspect: 'antiqueInspected', bid: 'antiqueBidding', pass: 'antiquePassed' },
  antiqueInspected: { bid: 'antiqueBiddingInspected', pass: 'antiquePassed' },
  antiqueBidding: { inspect: 'antiqueBiddingInspected', bid: 'antiqueSealed', pass: 'antiquePassed' },
  antiqueBiddingInspected: { bid: 'antiqueSealed', pass: 'antiquePassed' },
  antiqueSmallOpened: { openBox: 'antiqueOpened' },
  antiqueLargeOpened: { openBox: 'antiqueOpened' },
  antiqueOpened: { sellAll: 'antiqueSold' },
  antiqueSold: { nextLot: 'hubAfterAntique' },
  selectedPassed: { nextLot: 'hubSelected' },
  antiquePassed: { nextLot: 'hubAntique' },
  airportOffer: { buyBaggage: 'baggageSealed', returnToHub: 'hubStart' },
  airportUnaffordable: { returnToHub: 'hubLowBank' },
  baggageRevealedLow: { sellItem: 'baggageResultLow', sellAll: 'baggageResultLow' },
  baggageRevealedHigh: { sellItem: 'baggageResultHigh', sellAll: 'baggageResultHigh' },
  baggageResultLow: { returnToHub: 'hubStart' },
  baggageResultHigh: { returnToHub: 'hubStart' },
};

function requiredElement<E extends HTMLElement>(id: string): E {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing preview element: ${id}`);
  return node as E;
}

const root = requiredElement('app');
const picker = requiredElement<HTMLSelectElement>('example');
const outcome = requiredElement<HTMLSelectElement>('baggage-outcome');
const message = requiredElement('preview-message');
const keys = Object.keys(examples) as Example[];
for (const key of keys) picker.add(new Option(key, key));

function fromUrl(): Example {
  const key = new URLSearchParams(location.search).get('example');
  return keys.find((candidate) => candidate === key) ?? 'hubStart';
}

let current = fromUrl();

function nextExample(command: Stage3Command): Example | undefined {
  if (command.type === 'skipStory') return 'ordinaryInspection';
  if (command.type === 'enterAuction') {
    switch (command.tier) {
      case 'ordinary': return current === 'hubLowBank' ? 'recovery' : 'ordinaryInspection';
      case 'selected': return 'selectedInspection';
      case 'antique': return 'antiqueInspection';
    }
  }
  if (command.type === 'callAirport') return current === 'hubLowBank' ? 'airportUnaffordable' : 'airportOffer';
  if (command.type === 'spend') {
    if (command.offerId === 'home' || command.offerId === 'car') return 'hubOwned';
    if (current === 'hubStart') return 'hubNearUnlock';
    if (current === 'hubNearUnlock') return 'hubSelected';
    if (current === 'hubSelected') return 'hubNearAntique';
    if (current === 'hubNearAntique') return 'hubAntique';
  }
  if (current === 'baggageSealed' && command.type === 'openBox') {
    return outcome.value === 'high' ? 'baggageRevealedHigh' : 'baggageRevealedLow';
  }
  if (current === 'antiqueSealed' && command.type === 'openBox') {
    return command.boxId === smallBox.id ? 'antiqueSmallOpened' : 'antiqueLargeOpened';
  }
  if (current === 'ordinaryOpened' && command.type === 'sellItem') {
    return command.itemId === 'bicycle' ? 'ordinaryPartial' : 'ordinarySoldTool';
  }
  return routes[current]?.[command.type];
}

function show(key: Example): void {
  current = key;
  picker.value = key;
  const url = new URL(location.href);
  url.searchParams.set('example', key);
  history.replaceState(null, '', url);
  mountStage3(root, examples[key], (command) => {
    if (command.expectedRevision !== examples[current].revision) return;
    const next = nextExample(command);
    if (next) show(next);
    else message.textContent = 'Для продолжения этой ветки нужен движок. Можно выбрать другой снимок.';
    document.dispatchEvent(new CustomEvent('stage3-preview-command', { detail: command }));
  });
  message.textContent = '';
}

picker.addEventListener('change', () => show(keys.find((key) => key === picker.value) ?? 'hubStart'));
show(current);
