import type { GarageLot } from './catalog';
import { draw, seededRandom } from './random';
import { generateLot, opponentLimits } from './repeat-auctions';
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
export function generateStage6Lot(tier: AuctionTier, seed: number, lotNumber: number, distinct = false): GarageLot<Stage3Scene> {
  const tutorial = lotNumber === 1 && tier === 'ordinary';
  const base = distinct && !tutorial ? generateLot(tier, seed, lotNumber, rubleAuctionPricing,
    rubleEconomy.openingBid(tier, seed, lotNumber), true) : rubleEconomy.lot(tier, seed, lotNumber);
  if (base.sceneId === 'tutorial') return distinct
    ? { ...base, opponents: base.opponents.map(opponent => ({ ...opponent, limit: base.openingBid })) } : base;

  const visibleRoll = draw(seed ^ visibleStream);
  const showTableware = base.sceneId !== 'workshop' && visibleRoll.value < 0.4;
  const visibleFinds = base.visibleFinds.map((item, index) =>
    showTableware && index === 0 ? tablewareFor(tier, item.id, visibleRoll.word) : item);
  const hiddenRandom = seededRandom(seed ^ hiddenStream);
  const boxes = base.boxes.map((box, index) => ({
    ...box,
    name: !distinct && index === 0 && draw(seed ^ 0x5a1f83bc).value < 0.35 ? 'Вещи за ширмой' : box.name,
    contents: box.contents.map((item) => {
      const slotSeed = Math.floor(hiddenRandom() * 0x100000000);
      return jewelryFor(tier, item.id, slotSeed) ?? everydayFor(item.id, slotSeed ^ 0x743adb91) ?? item;
    }),
  }));
  const opponents = opponentLimits(
    tier, visibleFinds.map(({ hint }) => hint), boxes.length, base.opponents.map(({ name }) => name),
    seededRandom(seed ^ 0x41c6ce57), stage6AuctionPricing,
  );
  return { ...base, visibleFinds, boxes, opponents, ...(distinct ? { layoutSeed: draw(seed ^ 0x63a27e19).word } : {}), ...(distinct && draw(seed ^ 0x5a1f83bc).value < 0.35
    ? { screenId: `lot-${lotNumber}-decor-screen` } : {}) };
}

export const stage6Economy = { ...rubleEconomy, lot: generateStage6Lot };

export const stage12Economy = { ...stage6Economy, openBidding: true, lot: (tier: AuctionTier, seed: number, number: number) =>
  generateStage6Lot(tier, seed, number, true) };

export const firstAuctionEconomy = {
  ...stage6Economy,
  lot: (...args: Parameters<typeof generateStage6Lot>) => {
    const lot = generateStage6Lot(...args);
    return lot.sceneId === 'tutorial'
      ? { ...lot, opponents: lot.opponents.map(opponent => ({ ...opponent, limit: lot.openingBid })) }
      : lot;
  },
};
