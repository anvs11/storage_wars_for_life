import { repeatCatalog } from './catalog';
import type { GarageLot, LotFind, Rarity } from './catalog';
import type { InspectionHint } from './contract';
import { auctions } from './progression';
import { draw, seededRandom } from './random';
import type { AuctionTier, Stage3Scene } from './stage3-contract';

export type CandidateId = keyof typeof repeatCatalog;
type Condition = LotFind['condition'];
type RepeatScene = Exclude<Stage3Scene, 'tutorial'>;
const rarities = ['common', 'unusual', 'rare'] as const;
const conditionOrder = ['damaged', 'worn', 'good'] as const;
const attempts = 28;
const tolerance = 0.06;

export const economy = {
  ordinary: { budget: [12, 100], weights: [75, 22, 3], boxEstimate: 15, bidFactor: [0.48, 1.28] },
  selected: { budget: [30, 180], weights: [55, 35, 10], boxEstimate: 25, bidFactor: [0.40, 1.34] },
  antique: { budget: [55, 320], weights: [40, 40, 20], boxEstimate: 40, bidFactor: [0.34, 1.38] },
} as const;

export interface RepeatPricing {
  readonly tiers: Readonly<Record<AuctionTier, {
    readonly budget: readonly [number, number];
    readonly weights: readonly [number, number, number];
    readonly boxEstimate: number;
    readonly bidFactor: readonly [number, number];
  }>>;
  readonly ranges?: Readonly<Record<CandidateId, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]>>;
  readonly bidIncrement: number;
}
const legacyPricing: RepeatPricing = { tiers: economy, bidIncrement: 5 };

const workshop = ['drill', 'vise', 'level', 'wrench'] as const;
const household = ['kettle', 'lamp', 'radio', 'camera'] as const;
const audio = ['speaker', 'amplifier', 'turntable'] as const;
const equipment = ['floorLamp', 'sewingMachine', 'trunk'] as const;
const ceramic = ['replica', 'porcelain', 'stampedVase'] as const;
const heirlooms = ['clock', 'bronze', 'signedClock'] as const;

interface Template {
  readonly sceneId: RepeatScene;
  readonly openingBid: number;
  readonly visible: readonly (readonly CandidateId[])[];
  readonly boxes: readonly (readonly (readonly CandidateId[])[])[];
  readonly opponents: readonly string[];
}

const templates: Readonly<Record<AuctionTier, readonly [Template, Template]>> = {
  ordinary: [{
    sceneId: 'workshop', openingBid: auctions.ordinary.openingBid,
    visible: [workshop, workshop, workshop], boxes: [[workshop]], opponents: ['Марина', 'Олег'],
  }, {
    sceneId: 'household', openingBid: 25,
    visible: [household, household], boxes: [[household, household]], opponents: ['Виктория'],
  }],
  selected: [{
    sceneId: 'selected', openingBid: auctions.selected.openingBid,
    visible: [audio, equipment], boxes: [[audio, equipment]], opponents: ['Лев', 'Марина'],
  }, {
    sceneId: 'selected', openingBid: auctions.selected.openingBid,
    visible: [equipment, audio, equipment], boxes: [[audio], [equipment]], opponents: ['Лев', 'Виктория'],
  }],
  antique: [{
    sceneId: 'antiques', openingBid: auctions.antique.openingBid,
    visible: [ceramic, heirlooms], boxes: [[ceramic, heirlooms], [heirlooms]], opponents: ['Ирина', 'Семён'],
  }, {
    sceneId: 'antiques', openingBid: auctions.antique.openingBid,
    visible: [ceramic, heirlooms, ceramic], boxes: [[heirlooms], [ceramic]], opponents: ['Ирина', 'Лев'],
  }],
};

interface RepeatFind extends LotFind {
  readonly rarity: Rarity;
  readonly catalogId: CandidateId;
}

export interface RepeatLot extends GarageLot<RepeatScene> {
  readonly targetValue: number;
  readonly visibleFinds: readonly RepeatFind[];
  readonly boxes: readonly (GarageLot<RepeatScene>['boxes'][number] & { readonly contents: readonly RepeatFind[] })[];
}

type Contents = Pick<RepeatLot, 'visibleFinds' | 'boxes'>;

function templateFor(tier: AuctionTier, seed: number): Template {
  return templates[tier][draw(seed).value < 0.5 ? 0 : 1];
}

export function openingBidFor(tier: AuctionTier, seed: number): number {
  return templateFor(tier, seed).openingBid;
}

export function advanceAuctionPrice(price: number): number {
  return price + (price < 50 ? 5 : price < 100 ? 10 : 15);
}

export function visibleEstimate(visibleClues: readonly Pick<InspectionHint, 'estimatedSalePrice'>[]): number {
  return visibleClues.reduce((sum, { estimatedSalePrice }) =>
    sum + (estimatedSalePrice ? (estimatedSalePrice.min + estimatedSalePrice.max) / 2 : 0), 0);
}

// Только видимые диапазоны, число коробок и отдельный поток случайности.
export function opponentLimits(
  tier: AuctionTier, visibleClues: readonly Pick<InspectionHint, 'estimatedSalePrice'>[],
  boxCount: number, names: readonly string[], random: () => number, pricing: RepeatPricing = legacyPricing,
): GarageLot<RepeatScene>['opponents'] {
  const { boxEstimate, bidFactor: [min, max] } = pricing.tiers[tier];
  const estimate = visibleEstimate(visibleClues) + boxCount * boxEstimate;
  return names.map((name, index) => ({
    id: `bidder-${index + 1}`,
    name,
    limit: Math.floor(estimate * (min + (max - min) * random())),
  }));
}

function chooseItem(pool: readonly CandidateId[], weights: readonly [number, number, number], random: () => number): CandidateId {
  const ticket = random() * 100;
  const rarity = rarities[ticket < weights[0] ? 0 : ticket < weights[0] + weights[1] ? 1 : 2];
  const candidates = pool.filter((id) => repeatCatalog[id].rarity === rarity);
  return candidates[Math.floor(random() * candidates.length)]!;
}

function find(catalogId: CandidateId, condition: Condition, id: string, price: (min: number, max: number) => number, pricing: RepeatPricing): RepeatFind {
  const { name, rarity, conditions } = repeatCatalog[catalogId];
  const { clue, range } = conditions[condition];
  const [min, max] = pricing.ranges?.[catalogId][conditionOrder.indexOf(condition)] ?? range;
  return {
    id, catalogId, name, rarity, condition,
    salePrice: price(min, max),
    hint: { text: clue, estimatedSalePrice: { min, max } },
  };
}

function fill(template: Template, lotNumber: number, create: (pool: readonly CandidateId[], id: string) => RepeatFind): Contents {
  const prefix = `lot-${lotNumber}`;
  return {
    visibleFinds: template.visible.map((pool, index) => create(pool, `${prefix}-visible-${index + 1}`)),
    boxes: template.boxes.map((slots, index) => {
      const id = `${prefix}-box-${index + 1}`;
      return {
        id,
        name: template.boxes.length === 1 ? 'Закрытая коробка' : `Закрытая коробка №${index + 1}`,
        contents: slots.map((pool, slot) => create(pool, `${id}-item-${slot + 1}`)),
      };
    }),
  };
}

function fallbackContents(template: Template, lotNumber: number, target: number, pricing: RepeatPricing): Contents {
  const slots = [...template.visible, ...template.boxes.flat()];
  let remaining = target - slots.reduce((sum, pool) => sum + (pricing.ranges?.[pool[0]!][1][0] ?? repeatCatalog[pool[0]!].conditions.worn.range[0]), 0);
  return fill(template, lotNumber, (pool, id) => find(pool[0]!, 'worn', id, (min, max) => {
    const extra = Math.min(max - min, Math.max(0, remaining));
    remaining -= extra;
    return min + extra;
  }, pricing));
}

export function generateLot(tier: AuctionTier, seed: number, lotNumber: number, pricing: RepeatPricing = legacyPricing, openingBid = openingBidFor(tier, seed)): RepeatLot {
  const template = templateFor(tier, seed);
  const random = seededRandom(draw(seed).word);
  const { budget: [min, max], weights } = pricing.tiers[tier];
  const targetValue = min + Math.round((max - min) * (random() + random()) / 2);
  let closest: Contents | undefined;
  let smallestGap = Infinity;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = fill(template, lotNumber, (pool, id) => {
      const item = chooseItem(pool, weights, random);
      const condition = conditionOrder[Math.floor(random() * conditionOrder.length)]!;
      return find(item, condition, id, (low, high) => low + Math.floor(random() * (high - low + 1)), pricing);
    });
    const all = [...candidate.visibleFinds, ...candidate.boxes.flatMap(({ contents }) => contents)];
    const saleValue = all.reduce((sum, item) => sum + item.salePrice, 0);
    const gap = Math.abs(targetValue - saleValue);
    if (saleValue < min || saleValue > max || gap >= smallestGap) continue;
    closest = candidate;
    smallestGap = gap;
    if (gap <= Math.max(2, targetValue * tolerance)) break;
  }

  const content = closest ?? fallbackContents(template, lotNumber, targetValue, pricing);
  return {
    ...content,
    targetValue,
    sceneId: template.sceneId,
    openingBid,
    bidIncrement: pricing.bidIncrement,
    opponents: opponentLimits(
      tier, content.visibleFinds.map(({ hint }) => hint), content.boxes.length, template.opponents,
      seededRandom(seed ^ 0x41c6ce57), pricing,
    ),
  };
}
