import { chooseBaggage } from './baggage';
import type { GarageLot, LotFind } from './catalog';
import { createLot } from './catalog';
import type { InspectionHint, PassedReceipt, SoldReceipt } from './contract';
import { economy, generateLot, openingBidFor } from './repeat-auctions';
import type { RepeatPricing } from './repeat-auctions';
import { legacyEconomy } from './stage3-engine';
import type { GameEconomy } from './stage3-engine';

type PriceRanges = NonNullable<RepeatPricing['ranges']>;
const ranges = {
  drill: [[250, 650], [1300, 2600], [2800, 4800]],
  vise: [[150, 550], [900, 2100], [2300, 3500]],
  level: [[200, 550], [650, 1200], [1200, 2700]],
  wrench: [[450, 900], [950, 1900], [2300, 4300]],
  kettle: [[150, 400], [500, 1200], [1400, 2400]],
  lamp: [[200, 600], [650, 1700], [1700, 2900]],
  radio: [[300, 950], [1200, 2300], [2400, 4100]],
  camera: [[450, 1500], [1700, 3400], [3800, 6900]],
  speaker: [[650, 1300], [2400, 4900], [5000, 8700]],
  amplifier: [[900, 2400], [3500, 7200], [7000, 14500]],
  turntable: [[1400, 2600], [4500, 8500], [10000, 18500]],
  floorLamp: [[450, 1100], [1500, 3000], [3000, 5000]],
  sewingMachine: [[800, 2300], [3000, 7000], [6500, 12000]],
  trunk: [[800, 2500], [4200, 8400], [8800, 15000]],
  replica: [[450, 1300], [1400, 2900], [3200, 5600]],
  porcelain: [[1700, 3600], [3800, 7500], [8200, 15600]],
  stampedVase: [[4500, 9500], [13000, 31000], [65000, 106000]],
  clock: [[550, 1800], [2200, 4700], [4800, 8500]],
  bronze: [[1300, 5500], [4900, 12000], [12500, 22000]],
  signedClock: [[3500, 7900], [11500, 26000], [74000, 125000]],
} as const satisfies PriceRanges;

const pricing: RepeatPricing = {
  ranges,
  bidIncrement: 500,
  tiers: {
    ordinary: { ...economy.ordinary, budget: [1800, 11000], boxEstimate: 1600 },
    selected: { ...economy.selected, budget: [6900, 42000], boxEstimate: 4300 },
    antique: { ...economy.antique, budget: [12500, 160000], boxEstimate: 7900 },
  },
};

const offerPrices = {
  diner: 450, dinerWithTip: 650, cinema: 900, restaurant: 2600, theater: 1800, home: 23000, car: 18000,
};

const tutorialSource = createLot(1);
const tutorial: GarageLot<'tutorial'> = {
  ...tutorialSource,
  sceneId: 'tutorial',
  openingBid: 2000,
  bidIncrement: 500,
  opponents: [{ id: 'viktor', name: 'Виктор', limit: 2500 }],
  visibleFinds: [{
    ...tutorialSource.visibleFinds[0]!, salePrice: 4200,
    hint: { text: tutorialSource.visibleFinds[0]!.hint.text, estimatedSalePrice: { min: 3300, max: 5000 } },
  }],
  boxes: [{
    id: 'box', name: 'Закрытая коробка',
    contents: [{
      ...tutorialSource.boxes[0]!.contents[0]!, salePrice: 1100,
      hint: { text: 'Рукоятки потёрты, комплект рабочий.', estimatedSalePrice: { min: 800, max: 1400 } },
    }],
  }],
};

const openingBid: GameEconomy['openingBid'] = (tier, seed, lotNumber) => {
  if (tier === 'selected') return 6500;
  if (tier === 'antique') return 14000;
  return lotNumber === 1 || openingBidFor(tier, seed) === 20 ? 2000 : 2600;
};

export const rubleEconomy: GameEconomy = {
  openingBid,
  lot: (tier, seed, lotNumber) => lotNumber === 1 && tier === 'ordinary'
    ? tutorial : generateLot(tier, seed, lotNumber, pricing, openingBid(tier, seed, lotNumber)),
  advancePrice: (price) => price + (price < 5000 ? 500 : price < 10000 ? 1000 : price < 30000 ? 1500 : 3000),
  offerPrice: (id) => offerPrices[id],
  flowerPrice: 850,
  baggagePrice: 2400,
  baggageContents: (random) => {
    const original = chooseBaggage(random);
    return { ...original, boxes: original.boxes.map((box) => ({
      ...box,
      contents: box.contents.map((item) => ({
        ...item, salePrice: item.salePrice === 4 ? 350 : item.salePrice === 25 ? 2700 : 7800,
      })),
    })) };
  },
};

export const toRubles = (oldMoney: number): number => oldMoney * 100;

function migrateHint(hint: InspectionHint): InspectionHint {
  const estimate = hint.estimatedSalePrice;
  return { ...hint, estimatedSalePrice: estimate ? { min: toRubles(estimate.min), max: toRubles(estimate.max) } : null };
}

export function migrateLot<T extends string>(lot: GarageLot<T>): GarageLot<T> {
  const migrateFind = (item: LotFind): LotFind => ({ ...item, salePrice: toRubles(item.salePrice), hint: migrateHint(item.hint) });
  return {
    ...lot,
    openingBid: toRubles(lot.openingBid),
    bidIncrement: toRubles(lot.bidIncrement),
    visibleFinds: lot.visibleFinds.map(migrateFind),
    boxes: lot.boxes.map((box) => ({ ...box, contents: box.contents.map(migrateFind) })),
    opponents: lot.opponents.map((opponent) => ({ ...opponent, limit: toRubles(opponent.limit) })),
  };
}

export function migrateReceipt(receipt: SoldReceipt): SoldReceipt;
export function migrateReceipt(receipt: SoldReceipt | PassedReceipt): SoldReceipt | PassedReceipt;
export function migrateReceipt(receipt: SoldReceipt | PassedReceipt): SoldReceipt | PassedReceipt {
  if (receipt.outcome === 'passed') return receipt;
  return {
    ...receipt, purchasePrice: toRubles(receipt.purchasePrice),
    revenue: toRubles(receipt.revenue), profit: toRubles(receipt.profit),
  };
}

export const migratedEconomy: GameEconomy = {
  ...rubleEconomy,
  lot: (tier, seed, lotNumber) => migrateLot(legacyEconomy.lot(tier, seed, lotNumber)),
  advancePrice: (price) => toRubles(legacyEconomy.advancePrice(price / 100)),
  baggagePrice: toRubles(legacyEconomy.baggagePrice),
  baggageContents: (random) => {
    const original = chooseBaggage(random);
    return { ...original, boxes: original.boxes.map((box) => ({
      ...box, contents: box.contents.map((item) => ({ ...item, salePrice: toRubles(item.salePrice) })),
    })) };
  },
};
