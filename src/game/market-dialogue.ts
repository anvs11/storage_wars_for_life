import { draw } from './random';
import type { GarageItemView, ListingView, MarketOffer, SellerReview } from './stage5-contract';

const buyers = ['Ирина', 'Алексей', 'Светлана', 'Артём', 'Лидия', 'Павел', 'Зоя', 'Марат', 'Яна', 'Валерий', 'Алёна', 'Максим'];
const insult = /(?:^|[^а-я])(?:сука|мудак|долбо[её]б|идиот|урод|коз[её]л|пид[ао]р|хуй|ху[йеяю]|бля[дт]ь?|еблан|дебил)(?:[^а-я]|$)/iu;

export function marketOffers(listing: ListingView): readonly MarketOffer[] {
  return [...(listing.offer ? [listing.offer] : []), ...(listing.otherOffers ?? [])];
}

export const breakageChance = { good: 0, worn: 10, damaged: 30 } as const;

export function newMarketOffer(listing: ListingView, item: GarageItemView & { value: number; lotNumber: number | null; baggageId?: string },
  word: number, revision: number, unavailable: ReadonlySet<string>): MarketOffer | null {
  if (listing.price > item.estimate.max * 1.5) return null;
  const existing = marketOffers(listing);
  if (existing.length >= 3) return null;
  const available = buyers.filter(name => !unavailable.has(name) && !existing.some(({ buyer }) => buyer === name));
  const buyer = available[word % available.length];
  if (!buyer) return null;
  const fair = item.lotNumber === null ? item.value : Math.round(item.value * (85 + word % 26) / 100);
  const delivery = listing.price <= fair && (item.baggageId !== undefined || item.lotNumber !== null && word % 10 === 1);
  const price = Math.min(listing.price, Math.max(1, fair));
  const ceiling = Math.max(price, Math.min(listing.price, Math.round(item.value * (105 + word % 21) / 100)));
  return {
    id: `offer-${listing.id}-${revision}-${existing.length}`, buyer, price, ceiling, unread: true, delivery,
    messages: [{ side: 'buyer', text: delivery ? `Здравствуйте! Оформлю доставку за ${price} ₽.` : `Здравствуйте! Предлагаю ${price} ₽. Что скажете?` }],
  };
}

export function updateMarketOffer(offer: MarketOffer, text: string, requested: number | undefined, revision: number, fallbackCeiling: number): MarketOffer | null {
  if (offer.closed) return null;
  const message = text.trim().slice(0, 300);
  if (!message) return null;
  const normalized = message.toLowerCase().replace(/ё/g, 'е');
  const priceMention = normalized.match(/(?:^|[^\d])([1-9]\d{0,8}(?:[ \u00a0\u202f]\d{3})*)(?!\d)/u);
  const proposed = requested ?? (priceMention?.[1] ? Number(priceMention[1].replace(/\s/g, '')) : undefined);
  const closed = insult.test(normalized);
  const ceiling = offer.ceiling ?? fallbackCeiling;
  const accepted = proposed !== undefined && proposed > offer.price && proposed <= ceiling && !offer.delivery;
  const compromise = proposed !== undefined && proposed > ceiling && ceiling > offer.price && !offer.delivery;
  const price = accepted ? proposed : compromise ? Math.min(ceiling, offer.price + Math.ceil((ceiling - offer.price) / 2)) : offer.price;
  const reply = closed ? 'С таким обращением я прекращаю разговор.'
    : accepted ? `Договорились на ${price} ₽. Можем оформлять.`
    : compromise ? `Столько не потяну. Готов предложить ${price} ₽.`
    : proposed !== undefined ? `Моё предложение — ${price} ₽.`
    : `Какую цену вы предлагаете? Пока могу дать ${price} ₽.`;
  const messages = offer.messages ?? [{ side: 'buyer' as const, text: `Предлагаю ${offer.price} ₽.` }];
  return { ...offer, id: `${offer.id.split('@')[0]}@${revision}`, price, unread: true, countered: true, closed,
    messages: [...messages.slice(-18), { side: 'player', text: message }, { side: 'buyer', text: reply }] };
}

const successfulReview = 'Всё работает, сделка прошла хорошо.';
const brokenReviews = [
  { stars: 1, text: 'Товар сломался сразу после покупки.' },
  { stars: 2, text: 'Товар сломался вскоре после покупки.' },
  { stars: 3, text: 'После покупки обнаружилась поломка. Вещью можно пользоваться лишь частично.' },
] as const;

export function reviewFor(item: GarageItemView, offer: MarketOffer, seed: number): SellerReview {
  const roll = draw(seed);
  const followUp = draw(roll.seed).value;
  const identity = { buyer: offer.buyer, item: item.name };
  if (roll.value * 100 < breakageChance[item.condition]) {
    return { ...identity, ...brokenReviews[Math.floor(followUp * brokenReviews.length)]! };
  }
  return { ...identity, stars: followUp < 0.1 ? 4 : 5, text: successfulReview };
}

export function updateLegacyReview(review: SellerReview): SellerReview {
  if ((review.stars === 3 && review.text === 'Сделка состоялась, впечатление нейтральное.') ||
      (review.stars === 2 && review.text === 'Состояние хуже, чем ожидал за эту цену.')) {
    return { ...review, stars: 4, text: successfulReview };
  }
  return review;
}
