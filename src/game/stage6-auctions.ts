import type { GarageLot } from './catalog';
import { draw, seededRandom } from './random';
import { opponentLimits } from './repeat-auctions';
import type { AuctionTier, Stage3Scene } from './stage3-contract';
import { rubleAuctionPricing, rubleEconomy } from './stage5-economy';
import { everydayFor, jewelryFor, tablewareFor } from './stage6-catalog';

const visibleStream = 0x2144a1d9;
const hiddenStream = 0x9e3779b9;
export const stage6AuctionPricing = {
  ...rubleAuctionPricing,
  tiers: {
    ...rubleAuctionPricing.tiers,
    antique: { ...rubleAuctionPricing.tiers.antique, boxEstimate: 16500, bidFactor: [0.42, 1.36] as const },
  },
};

// The legacy generator verifies Stage 5 snapshots. New saved lots must opt in to this version.
export function generateStage6Lot(tier: AuctionTier, seed: number, lotNumber: number): GarageLot<Stage3Scene> {
  const base = rubleEconomy.lot(tier, seed, lotNumber);
  if (base.sceneId === 'tutorial') return base;

  const visibleRoll = draw(seed ^ visibleStream);
  const showTableware = base.sceneId !== 'workshop' && visibleRoll.value < 0.4;
  const visibleFinds = base.visibleFinds.map((item, index) =>
    showTableware && index === 0 ? tablewareFor(tier, item.id, visibleRoll.word) : item);
  const hiddenRandom = seededRandom(seed ^ hiddenStream);
  const boxes = base.boxes.map((box, index) => ({
    ...box,
    name: index === 0 && draw(seed ^ 0x5a1f83bc).value < 0.35 ? 'Вещи за ширмой' : box.name,
    contents: box.contents.map((item) => {
      const slotSeed = Math.floor(hiddenRandom() * 0x100000000);
      return jewelryFor(tier, item.id, slotSeed) ?? everydayFor(item.id, slotSeed ^ 0x743adb91) ?? item;
    }),
  }));
  const opponents = opponentLimits(
    tier, visibleFinds.map(({ hint }) => hint), boxes.length, base.opponents.map(({ name }) => name),
    seededRandom(seed ^ 0x41c6ce57), stage6AuctionPricing,
  );
  return { ...base, visibleFinds, boxes, opponents };
}

export const stage6Economy = { ...rubleEconomy, lot: generateStage6Lot };

export const firstAuctionEconomy = {
  ...stage6Economy,
  lot: (...args: Parameters<typeof generateStage6Lot>) => {
    const lot = generateStage6Lot(...args);
    return lot.sceneId === 'tutorial'
      ? { ...lot, opponents: lot.opponents.map(opponent => ({ ...opponent, limit: lot.openingBid })) }
      : lot;
  },
};
