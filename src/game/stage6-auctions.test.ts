import { expect, it } from 'vitest';
import { tiers } from './progression';
import { draw } from './random';
import { rubleEconomy } from './stage5-economy';
import { generateStage6Lot, stage6AuctionPricing } from './stage6-auctions';
import { applyGarageCommand, enterLot, getView } from './stage2-engine';
import { findSize, carLimit } from './stage5-engine';
import { opponentLimits, visibleEstimate } from './repeat-auctions';
import { seededRandom } from './random';

it('сохраняет фасад и пределы соперников, если изменились только скрытые находки', () => {
  let examples = 0;
  for (const tier of tiers) {
    for (let seed = 0; seed < 2000; seed += 1) {
      const previous = rubleEconomy.lot(tier, seed, 2);
      const current = generateStage6Lot(tier, seed, 2);
      const boxLabels = (lot: typeof previous) => lot.boxes.map(({ name }) => name);
      if (JSON.stringify(previous.visibleFinds) !== JSON.stringify(current.visibleFinds) ||
          JSON.stringify(boxLabels(previous)) !== JSON.stringify(boxLabels(current)) ||
          JSON.stringify(previous.boxes) === JSON.stringify(current.boxes)) continue;
      const fromFacade = opponentLimits(tier, previous.visibleFinds.map(({ hint }) => hint), previous.boxes.length,
        previous.opponents.map(({ name }) => name), seededRandom(seed ^ 0x41c6ce57), stage6AuctionPricing);
      expect(current.opponents).toEqual(fromFacade);
      expect(current.openingBid).toBe(previous.openingBid);
      expect(current).toEqual(generateStage6Lot(tier, seed, 2));
      examples += 1;
    }
  }
  expect(examples).toBeGreaterThan(0);
});

it.each([0x753a9f00, 0xa8e45fc2])('измеряет две стратегии и диапазон цен на выборке %s', (sample) => {
  const lotCount = 3000;
  const report = tiers.map((tier, index) => {
    let seed = sample ^ index;
    const boxEstimate = [2000, 4000, 22000][index]!;
    let min = Infinity;
    let max = 0;
    let positive = 0;
    let negative = 0;
    let passed = 0;
    let always = 0;
    let selective = 0;
    let hidden = 0;
    let jewelry = 0;
    for (let i = 0; i < lotCount; i += 1) {
      const next = draw(seed);
      seed = next.seed;
      const lot = generateStage6Lot(tier, next.word, i + 2);
      const hiddenFinds = lot.boxes.flatMap(({ contents }) => contents);
      const all = [...lot.visibleFinds, ...hiddenFinds];
      hidden += hiddenFinds.length;
      jewelry += hiddenFinds.filter((item) => 'storage' in item && item.storage === 'jewelryBox').length;
      let volume = carLimit;
      let proceeds = 0;
      for (const item of [...all].sort((left, right) => visibleEstimate([right.hint]) / findSize(right) -
          visibleEstimate([left.hint]) / findSize(left))) {
        const size = findSize(item);
        if (size > volume) continue;
        volume -= size;
        proceeds += item.salePrice;
      }
      min = Math.min(min, proceeds);
      max = Math.max(max, proceeds);
      let auction = enterLot({ bank: 1000000, revision: 0, status: 18 }, i + 2, lot);
      const limit = Math.floor((visibleEstimate(lot.visibleFinds.map(({ hint }) => hint)) + boxEstimate * lot.boxes.length) * 0.85);
      let belowLimit = true;
      while (auction.phase === 'inspection' || auction.phase === 'bidding') {
        const view = getView(auction, rubleEconomy.advancePrice);
        if (view.phase !== 'inspection' && view.phase !== 'bidding') throw new Error('Ожидалась следующая ставка.');
        if (view.nextBidAmount > limit) belowLimit = false;
        auction = applyGarageCommand(auction, { type: 'bid', expectedRevision: auction.revision }, rubleEconomy.advancePrice);
      }
      if (auction.phase !== 'reveal') throw new Error('Ожидалась покупка с тестовым банком.');
      const profit = proceeds - auction.purchasePrice;
      if (profit > 0) positive += 1;
      if (profit < 0) negative += 1;
      always += profit;
      if (belowLimit) selective += profit;
      else passed += 1;
    }
    return { tier, min, max, positive, negative, passed, always: Math.round(always / lotCount),
      selective: Math.round(selective / lotCount), jewelry: +(100 * jewelry / hidden).toFixed(2) };
  });
  console.info(JSON.stringify(report));
  for (const row of report) {
    expect(row.positive).toBeGreaterThan(0);
    expect(row.negative).toBeGreaterThan(0);
    expect(row.passed).toBeGreaterThan(0);
    expect(row.selective).toBeGreaterThan(row.always);
  }
});

it('измеряет частоту украшений в закрытых местах на фиксированной выборке', () => {
  const count = 3000;
  const report = tiers.map((tier, index) => {
    let seed = 0x753a9f00 ^ index;
    let slots = 0;
    let jewels = 0;
    for (let i = 0; i < count; i += 1) {
      const next = draw(seed);
      seed = next.seed;
      const lot = generateStage6Lot(tier, next.word, i + 2);
      expect(lot.visibleFinds.every((item) => !('storage' in item && item.storage === 'jewelryBox'))).toBe(true);
      for (const item of lot.boxes.flatMap(({ contents }) => contents)) {
        slots += 1;
        if ('storage' in item && item.storage === 'jewelryBox') jewels += 1;
      }
    }
    return { tier, slots, jewels, percent: 100 * jewels / slots };
  });
  console.log(JSON.stringify(report));
  for (const item of report) {
    expect(item.jewels).toBeGreaterThan(0);
    expect(item.percent).toBeLessThan(4);
  }
});

it('версия 12 сохраняет экземпляры и исключает одинаковые видимые названия после замены сервизов', () => {
  for (const tier of tiers) {
    for (let seed = 0; seed < 80; seed++) {
      const lot = generateStage6Lot(tier, seed, 3, true);
      expect(generateStage6Lot(tier, seed, 3, true)).toEqual(lot);
      expect(new Set(lot.visibleFinds.map(item => item.name)).size).toBe(lot.visibleFinds.length);
      const ids = [...lot.visibleFinds.map(item => item.id), ...lot.boxes.flatMap(box => [box.id, ...box.contents.map(item => item.id)])];
      expect(new Set(ids).size).toBe(ids.length);
      const fromFacade = opponentLimits(tier, lot.visibleFinds.map(item => item.hint), lot.boxes.length,
        lot.opponents.map(opponent => opponent.name), seededRandom(seed ^ 0x41c6ce57), stage6AuctionPricing);
      expect(lot.opponents).toEqual(fromFacade);
    }
  }
});
