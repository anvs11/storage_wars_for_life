import { expect, it } from 'vitest';
import { tiers } from './progression';
import { draw } from './random';
import { economy, generateLot, visibleEstimate } from './repeat-auctions';
import type { AuctionTier } from './stage3-contract';
import { getView } from './stage3-engine';
import { enter, finishAuction, hub, inspectAll } from './stage3-test-support';

const size = 1_000;
const trainingSeed = 0x9e3779b9;
const evaluationSeeds = { primary: 0x315ae115, holdout: 0x721c713b } as const;
const reserve = 0.15;

function seeds(seed: number, tier: AuctionTier): number[] {
  seed ^= tiers.indexOf(tier) * 0x85ebca6b;
  return Array.from({ length: size }, () => {
    const next = draw(seed);
    seed = next.seed;
    return next.word;
  });
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function typicalBox(tier: AuctionTier): number {
  const samples = seeds(trainingSeed, tier).flatMap((seed, index) => generateLot(tier, seed, index + 2).boxes.map(({ contents }) =>
    contents.reduce((sum, { salePrice }) => sum + salePrice, 0)));
  return Math.round(median(samples));
}

function stats(purchases: readonly number[]) {
  const total = purchases.reduce((sum, profit) => sum + profit, 0);
  return {
    buy: purchases.length,
    pass: size - purchases.length,
    lossPct: purchases.length ? 100 * purchases.filter((profit) => profit < 0).length / purchases.length : 0,
    median: purchases.length ? median(purchases) : null,
    total,
    perLot: total / size,
  };
}

function measure(tier: AuctionTier, sample: number, hiddenEstimate: number) {
  const starting = { ...hub(42), bank: 10_000, status: 18 };
  const reckless: number[] = [];
  const careful: number[] = [];
  let rare = 0;
  let itemCount = 0;
  for (const seed of seeds(sample, tier)) {
    const lot = generateLot(tier, seed, 2);
    const things = [...lot.visibleFinds, ...lot.boxes.flatMap(({ contents }) => contents)];
    itemCount += things.length;
    rare += things.filter(({ rarity }) => rarity === 'rare').length;
    const base = enter({ ...starting, offerSeeds: { ...starting.offerSeeds, [tier]: seed } }, tier);
    const seen = inspectAll(base);
    const view = getView(seen);
    if (view.phase !== 'inspection') throw new Error('Ожидается лот с уликами');
    const hints = view.visibleItems.flatMap(({ hint }) => hint ? [hint] : []);
    const boxCount = view.visibleItems.filter(({ hint, canInspect }) => !hint && !canInspect).length;
    const limit = Math.floor((visibleEstimate(hints) + boxCount * hiddenEstimate) * (1 - reserve));
    for (const [profits, ceiling] of [[reckless, Infinity], [careful, limit]] as const) {
      const result = finishAuction(seen, ceiling);
      if (result.phase !== 'result') throw new Error('Квитанция отсутствует');
      if (result.receipt.outcome === 'sold') profits.push(result.receipt.profit);
    }
  }
  return { reckless: stats(reckless), careful: stats(careful), rarePct: 100 * rare / itemCount };
}

it('сверяет обе стратегии на основной и отложенной выборках для каждого класса', () => {
  const report = tiers.flatMap((tier) => {
    const box = typicalBox(tier);
    return Object.entries(evaluationSeeds).map(([sample, seed]) => ({ tier, sample, box, ...measure(tier, seed, box) }));
  });
  console.log(JSON.stringify({ size, trainingSeed, evaluationSeeds, reserve, economy, report }, null, 2));
  for (const { reckless, careful } of report) {
    expect(reckless.buy).toBe(size);
    expect(reckless.lossPct).toBeGreaterThanOrEqual(25);
    expect(careful.buy).toBeGreaterThan(0);
    expect(careful.pass).toBeGreaterThan(0);
    expect(careful.total).toBeGreaterThan(0);
    expect(careful.perLot).toBeGreaterThan(reckless.perLot);
  }
}, 60_000);
