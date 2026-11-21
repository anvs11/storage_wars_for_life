import type { InventoryContents } from './inventory';

export const baggagePrice = 25;

const outcomes = [
  { weight: 45, name: 'Потёртый дорожный набор', salePrice: 4 },
  { weight: 35, name: 'Портативная колонка', salePrice: 25 },
  { weight: 20, name: 'Винтажный фотоаппарат', salePrice: 60 },
] as const;

export function chooseBaggage(random: () => number): InventoryContents {
  const value = random();
  if (!(value >= 0 && value < 1)) throw new RangeError('Случайное число должно быть в диапазоне [0, 1).');
  let ticket = value * 100;
  for (const { weight, name, salePrice } of outcomes) {
    if (ticket < weight) {
      return {
        visibleFinds: [],
        boxes: [{ id: 'suitcase', name: 'Закрытый чемодан', contents: [{ id: 'suitcase-find', name, salePrice }] }],
      };
    }
    ticket -= weight;
  }
  throw new Error('Веса багажа не покрывают 100 процентов.');
}
