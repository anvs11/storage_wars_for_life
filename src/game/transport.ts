export const transportModels = ['scooter', 'zhiguli', 'pickup', 'van', 'heavy'] as const;
export type TransportModel = typeof transportModels[number];

export type TransportState =
  | { readonly model: Exclude<TransportModel, 'heavy'> }
  | { readonly model: 'heavy'; readonly engine: 0 | 1 | 2; readonly trailer: 0 | 1 | 2 };

export type TransportUpgrade = 'restoreZhiguli' | 'buyPickup' | 'buyVan' | 'buyHeavy'
  | 'reinforceSuspension' | 'tuneEngine' | 'highSideTrailer' | 'containerTrailer';

export const transportNames: Record<TransportModel, string> = {
  scooter: 'Курьерский электроскутер',
  zhiguli: 'Жигули ВАЗ-2107',
  pickup: 'Старый пикап',
  van: 'Грузовой фургон',
  heavy: 'Тяжёлый пикап',
};

export const trailerNames = ['Открытый прицеп', 'Бортовой прицеп', 'Контейнерный прицеп'] as const;

const sizes = { scooter: 2, zhiguli: 4, pickup: 6, van: 8, heavy: 10 } as const;
const trailerSizes = [10, 12, 16] as const;

export function describeVehicle(transport: TransportState) {
  return {
    model: transport.model,
    capacity: transport.model === 'heavy' ? trailerSizes[transport.trailer] : sizes[transport.model],
    ...(transport.model === 'heavy' ? { trailer: transport.trailer } : {}),
  };
}

export function hasBonusAuction(transport: TransportState): boolean {
  return transport.model === 'heavy' && transport.engine === 2;
}

type Offer = { id: TransportUpgrade; label: string; price: number; next: TransportState };
const replacement: Partial<Record<TransportModel, Offer>> = {
  scooter: { id: 'restoreZhiguli', label: 'Поставить Жигули на ход', price: 3000, next: { model: 'zhiguli' } },
  zhiguli: { id: 'buyPickup', label: 'Купить старый пикап', price: 65000, next: { model: 'pickup' } },
  pickup: { id: 'buyVan', label: 'Купить грузовой фургон', price: 180000, next: { model: 'van' } },
  van: { id: 'buyHeavy', label: 'Купить тяжёлый пикап с прицепом', price: 690000, next: { model: 'heavy', engine: 0, trailer: 0 } },
};

export function transportOffers(transport: TransportState): Offer[] {
  if (transport.model !== 'heavy') {
    const offer = replacement[transport.model];
    return offer ? [offer] : [];
  }
  const { engine, trailer } = transport;
  const offers: Offer[] = [];
  if (engine === 0) offers.push({ id: 'reinforceSuspension', label: 'Усилить подвеску', price: 75000, next: { ...transport, engine: 1 } });
  if (engine === 1) offers.push({ id: 'tuneEngine', label: 'Улучшить двигатель и трансмиссию', price: 145000, next: { ...transport, engine: 2 } });
  if (trailer === 0) offers.push({ id: 'highSideTrailer', label: 'Поставить бортовой прицеп', price: 48000, next: { ...transport, trailer: 1 } });
  if (trailer === 1) offers.push({ id: 'containerTrailer', label: 'Поставить контейнерный прицеп', price: 110000, next: { ...transport, trailer: 2 } });
  return offers;
}

export function requiresLongBed(name: string): boolean {
  return name === 'Напольный светильник';
}
