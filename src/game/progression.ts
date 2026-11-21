import type { AuctionTier, OfferId } from './stage3-contract';

export const tiers = ['ordinary', 'selected', 'antique'] as const satisfies readonly AuctionTier[];

export const auctions = {
  ordinary: { title: 'Обычные торги', requiredStatus: 0, openingBid: 20 },
  selected: { title: 'Отборные торги', requiredStatus: 8, openingBid: 50 },
  antique: { title: 'Антикварные торги', requiredStatus: 18, openingBid: 90 },
} as const satisfies Record<AuctionTier, { title: string; requiredStatus: number; openingBid: number }>;

interface Offer {
  readonly title: string;
  readonly price: number;
  readonly statusGain: number;
  readonly requiredStatus: number;
}

export const offers = {
  diner: { title: 'Закусочная', price: 5, statusGain: 1, requiredStatus: 0 },
  dinerWithTip: { title: 'Закусочная с чаевыми', price: 7, statusGain: 2, requiredStatus: 0 },
  cinema: { title: 'Кино', price: 10, statusGain: 2, requiredStatus: 8 },
  restaurant: { title: 'Ресторан', price: 25, statusGain: 4, requiredStatus: 18 },
  theater: { title: 'Театр', price: 20, statusGain: 3, requiredStatus: 18 },
  home: { title: 'Улучшение дома', price: 150, statusGain: 5, requiredStatus: 0 },
  car: { title: 'Улучшение машины', price: 100, statusGain: 5, requiredStatus: 0 },
} as const satisfies Record<OfferId, Offer>;

export const offerIds = ['diner', 'dinerWithTip', 'cinema', 'restaurant', 'theater', 'home', 'car'] as const satisfies readonly OfferId[];
export type Asset = 'home' | 'car';

export function isAsset(id: OfferId): id is Asset {
  return id === 'home' || id === 'car';
}
