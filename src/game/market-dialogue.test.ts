import { expect, it } from 'vitest';
import { reviewFor, updateLegacyReview } from './market-dialogue';
import { draw } from './random';

it('даёт низкие оценки только при поломке и 4 звезды в 10% успешных сделок', () => {
  const item = { id: 'lamp', name: 'Лампа', size: 1, position: 'shelf', clue: '', estimate: { min: 400, max: 800 } } as const;
  const offer = { id: 'offer', buyer: 'Павел', price: 950, unread: false };
  const seeds = Array.from({ length: 512 }, (_, seed) => seed);
  for (const [condition, failure] of [['good', 0], ['worn', 0.1], ['damaged', 0.3]] as const) {
    const lowRatings = new Set<number>();
    for (const seed of seeds) {
      const roll = draw(seed);
      const review = reviewFor({ ...item, condition }, offer, seed);
      const breaks = roll.value < failure;
      expect(review.stars <= 3).toBe(breaks);
      if (breaks) {
        expect(review.text).toMatch(/сломал|поломк/);
        lowRatings.add(review.stars);
      } else {
        expect(review.stars).toBe(draw(roll.seed).value < 0.1 ? 4 : 5);
      }
    }
    expect([...lowRatings].sort()).toEqual(failure ? [1, 2, 3] : []);
  }
});

it('переводит прежний нейтральный отзыв в 4 звезды и сохраняет отзывы о поломках', () => {
  const old = { buyer: 'Яна', item: 'Настольная лампа', stars: 3, text: 'Сделка состоялась, впечатление нейтральное.' } as const;
  expect(updateLegacyReview(old)).toMatchObject({ ...old, stars: 4, text: 'Всё работает, сделка прошла хорошо.' });
  const broken = { ...old, text: 'После покупки обнаружилась поломка.' };
  expect(updateLegacyReview(broken)).toBe(broken);
});
