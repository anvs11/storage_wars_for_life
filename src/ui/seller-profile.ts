import type { SellerReview } from '../game/stage5-contract';
import portrait from './assets/bidder-player.jpg';
import { element } from './dom';

export function sellerIdentity() {
  const row = element('div', 'seller-identity');
  const image = element('img', '');
  image.src = portrait;
  image.alt = 'Портрет героя';
  row.append(image, element('strong', '', 'Вячеслав'));
  return row;
}

export function sellerProfile(reviews: readonly SellerReview[]) {
  const panel = element('section', 'seller-profile');
  const count = reviews.length;
  const rating = count ? (reviews.reduce((sum, r) => sum + r.stars, 0) / count).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' ★' : 'Пока без оценок';
  panel.append(sellerIdentity(), element('strong', 'seller-stats', `Продажи на Маркете · ${count === 100 ? '100+' : count}`),
    element('p', '', rating), element('h3', '', 'Отзывы покупателей'));
  if (!count) panel.append(element('p', '', 'Первый отзыв появится после продажи по объявлению.'));
  for (const r of reviews.slice(-5).reverse()) {
    const review = element('article', 'seller-review');
    review.append(element('strong', '', `${r.buyer} · ${r.stars}/5`), element('small', '', r.item), element('p', '', r.text));
    panel.append(review);
  }
  return panel;
}
