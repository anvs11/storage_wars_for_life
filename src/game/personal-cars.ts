export const personalCars = [
  { id: 'mini', name: 'MINI Cooper', status: 12, price: 550000 },
  { id: 'q3', name: 'Audi Q3', status: 20, price: 1150000 },
  { id: 'cayenne', name: 'Porsche Cayenne', status: 28, price: 2200000 },
  { id: 'amg', name: 'Mercedes-AMG GLE Coupé', status: 36, price: 3800000 },
  { id: 'range', name: 'Range Rover', status: 48, price: 5500000 },
] as const;

export type PersonalCar = typeof personalCars[number]['id'];

export function personalCarOffer(current: PersonalCar | undefined, status: number, bank: number, cityVisit: boolean) {
  const index = personalCars.findIndex(({ id }) => id === current);
  const car = personalCars[index + 1];
  if (!car) return null;
  const tradeIn = Math.round((personalCars[index]?.price ?? 0) * 0.6);
  const total = car.price - tradeIn;
  const blocked = status < car.status ? `Нужно ${car.status} очков социального рейтинга. Сейчас ${status}.`
    : !cityVisit ? 'Сначала сходи в кино, ресторан или театр.'
    : bank < total ? 'Не хватает денег на доплату.' : null;
  return { ...car, tradeIn, total, blocked };
}
