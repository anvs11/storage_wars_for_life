import { draw } from './random';
import { capacityLimit, jewelryLimit, openCargoItems, storageUsage } from './stage5-engine';
import type { OwnedItem, Stage5State } from './stage5-engine';
import type { CalendarState } from './stage7-calendar';

export const fleaCapacity = 15;
const saleRate = { min: 70, max: 95 } as const;

export interface FleaSale {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly size?: OwnedItem['size'];
}

export interface FleaReceipt {
  readonly phase: 'receipt';
  readonly day: number;
  readonly sold: readonly FleaSale[];
  readonly revenue: number;
  readonly bankBefore?: number;
}

export interface FleaState {
  readonly items: readonly OwnedItem[];
  readonly baggageSelection: readonly string[];
  readonly seed: number;
  readonly visit: { readonly phase: 'offer' } | FleaReceipt | null;
}

export function initialFlea(base: Stage5State): FleaState {
  return { items: [], baggageSelection: [], seed: draw(base.base.game.nextSeed ^ 0x464c4541).word, visit: null };
}

export function fleaMorning({ day, period }: CalendarState): boolean {
  return period === 'morning' && (day - 1) % 7 >= 5;
}

export const boxVolume = (items: readonly OwnedItem[]): number => items.reduce((sum, item) => sum + item.size, 0);

export function baggageItems(base: Stage5State): readonly OwnedItem[] {
  const game = base.base.game;
  return game.phase === 'baggageInventory' && base.baggageArrived ? openCargoItems(game) : [];
}

export function packingBlock(base: Stage5State, used: number, item: OwnedItem): string | null {
  if (base.listings.some(({ itemId }) => item.id === itemId)) return 'Сначала сними объявление.';
  if (base.cargo.includes(item.id)) return 'Сначала убери вещь из выбранного груза.';
  return used + item.size > fleaCapacity ? 'В коробке не хватает места.' : null;
}

export function returnable(base: Stage5State, item: OwnedItem): boolean {
  const jewelry = item.position === 'jewelryBox';
  const limit = jewelry ? jewelryLimit : capacityLimit(base.capacityUpgrades, 'garage');
  return storageUsage(base.items, jewelry) + item.size <= limit;
}

function salePrice(value: number, percent: number): number {
  return value === 0 ? 0 : Math.max(1, Math.round(value * (percent / 100)));
}

export function fleaEstimate({ estimate }: OwnedItem): OwnedItem['estimate'] {
  return { min: salePrice(estimate.min, saleRate.min), max: salePrice(estimate.max, saleRate.max) };
}

export function sellAtFlea(flea: FleaState) {
  let seed = flea.seed;
  const sold: { item: OwnedItem; price: number }[] = [];
  const remaining: OwnedItem[] = [];
  for (const item of flea.items) {
    const roll = draw(seed);
    seed = roll.seed;
    if (roll.value >= 0.8 || item.value === 0) {
      remaining.push(item);
    } else {
      const rate = saleRate.min + roll.word % (saleRate.max - saleRate.min + 1);
      sold.push({ item, price: salePrice(item.value, rate) });
    }
  }
  return { seed, sold, remaining };
}
