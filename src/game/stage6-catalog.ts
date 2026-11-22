import type { LotFind } from './catalog';
import { draw } from './random';
import type { AuctionTier } from './stage3-contract';

interface Variant {
  readonly name: string;
  readonly condition: LotFind['condition'];
  readonly size: 1 | 2;
  readonly range: readonly [number, number];
  readonly clue: string;
}

const sets: Record<AuctionTier, readonly Variant[]> = {
  ordinary: [
    { name: 'Керамический сервиз', condition: 'damaged', size: 2, range: [550, 950], clue: 'На чашке скол, двух блюдец не хватает.' },
    { name: 'Бытовой сервиз', condition: 'worn', size: 2, range: [1400, 2400], clue: 'Рисунок местами стёрся, все чашки на месте.' },
  ],
  selected: [
    { name: 'Фарфоровый сервиз', condition: 'worn', size: 2, range: [5500, 9000], clue: 'Клеймо читается. На одном блюдце тонкая трещина.' },
    { name: 'Комплектный фарфоровый сервиз', condition: 'good', size: 2, range: [11000, 18000], clue: 'Клеймо и серия совпадают на всех предметах, сколов нет.' },
  ],
  antique: [
    { name: 'Реплика золочёного сервиза', condition: 'worn', size: 2, range: [1400, 2900], clue: 'Печатная кайма повторяет рисунок старой серии. Клеймо современное.' },
    { name: 'Коллекционный сервиз с гжельской росписью', condition: 'good', size: 2, range: [29000, 54000], clue: 'Роспись от руки, сохранились номер серии и совпадающие клейма.' },
  ],
};

const jewelry = [
  { name: 'Серебряные серьги', condition: 'good', size: 1, range: [3600, 6500], clue: 'Застёжки целы, проба читается на обеих серьгах.' },
  { name: 'Золотое кольцо', condition: 'worn', size: 1, range: [17000, 32000], clue: 'Клеймо читается, на ободке заметны царапины.' },
  { name: 'Коллекционное ожерелье', condition: 'good', size: 1, range: [93000, 125000], clue: 'На застёжке клеймо и номер серии, звенья целы.' },
] as const satisfies readonly Variant[];

const jewelryChance: Record<AuctionTier, number> = { ordinary: 0.005, selected: 0.01, antique: 0.02 };

const everyday = [
  { name: 'Упаковка носков', condition: 'good', size: 1, range: [120, 380], clue: 'Упаковка цела.' },
  { name: 'Защитное стекло', condition: 'good', size: 1, range: [150, 450], clue: 'Плёнка цела, на коробке указана модель телефона.' },
  { name: 'Дорожный фен', condition: 'worn', size: 1, range: [650, 1350], clue: 'Корпус потёрт, шнур цел.' },
] as const satisfies readonly Variant[];

export type Stage6Find = LotFind & {
  readonly size: Variant['size'];
  readonly storage: 'shelf' | 'jewelryBox';
};

function itemFor(variant: Variant, id: string, seed: number, storage: Stage6Find['storage']): Stage6Find {
  const [min, max] = variant.range;
  return {
    id, name: variant.name, condition: variant.condition, size: variant.size, storage,
    salePrice: min + Math.floor(draw(seed).value * (max - min + 1)),
    hint: { text: variant.clue, estimatedSalePrice: { min, max } },
  };
}

export function tablewareFor(tier: AuctionTier, id: string, seed: number): Stage6Find {
  const choice = draw(seed);
  const variants = sets[tier];
  const variant = variants[Math.floor(choice.value * variants.length)]!;
  return itemFor(variant, id, choice.seed, 'shelf');
}

export function jewelryFor(tier: AuctionTier, id: string, seed: number): Stage6Find | null {
  const chance = draw(seed);
  if (chance.value >= jewelryChance[tier]) return null;
  const choice = draw(chance.seed);
  const variant = jewelry[Math.floor(choice.value * jewelry.length)]!;
  return itemFor(variant, id, choice.seed, 'jewelryBox');
}

export function everydayFor(id: string, seed: number): Stage6Find | null {
  const choice = draw(seed);
  if (choice.value >= 0.16) return null;
  const variant = draw(choice.seed);
  return itemFor(everyday[Math.floor(variant.value * everyday.length)]!, id, variant.seed, 'shelf');
}
