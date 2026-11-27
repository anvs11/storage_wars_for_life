import { personalCars } from './personal-cars';
import type { PersonalCar } from './personal-cars';
import { describeVehicle, hasBonusAuction, trailerCatalog, trailerIds, transportModels, transportNames, workModelOffer } from './transport';
import type { Trailer, TransportModel, TransportState } from './transport';

type VehicleTarget = { readonly category: 'personal'; readonly model: PersonalCar }
  | { readonly category: 'work'; readonly model: TransportModel };
export type ShowroomTarget = VehicleTarget | { readonly category: 'trailers'; readonly model: Trailer };

export interface Fleet {
  readonly work: readonly TransportState[];
  readonly personal: readonly PersonalCar[];
  readonly workGoal?: TransportModel;
  readonly personalGoal?: PersonalCar;
  readonly trailers?: readonly Trailer[];
  readonly trailerGoal?: Trailer;
}

export interface ShowroomContext {
  readonly fleet: Fleet;
  readonly work: TransportState;
  readonly personal?: PersonalCar;
  readonly bank: number;
  readonly status: number;
  readonly cityVisit: boolean;
  readonly firstAuctionDone: boolean;
}

const personalClasses: Record<PersonalCar, string> = {
  mini: 'Городской хэтчбек', q3: 'Компактный кроссовер', cayenne: 'Спортивный кроссовер',
  amg: 'Купе-кроссовер', range: 'Представительский внедорожник',
};
const workClasses: Record<TransportModel, string> = {
  scooter: 'Курьерский', zhiguli: 'Унаследованный седан', pickup: 'Открытый кузов', van: 'Закрытый кузов', heavy: 'Тягач с прицепом',
};

export function existingFleet(work: TransportState, personal?: PersonalCar): Fleet {
  return { work: work.model === 'scooter' ? [work] : [{ model: 'scooter' }, work], personal: personal ? [personal] : [] };
}

export function showroomCard(context: ShowroomContext, target: VehicleTarget) {
  const { fleet, bank, status } = context;
  const personal = target.category === 'personal' ? personalCars.find(car => car.id === target.model) : undefined;
  const work = target.category === 'work' ? fleet.work.find(car => car.model === target.model) : undefined;
  const offer = target.category === 'work' ? workModelOffer(target.model) : undefined;
  const price = personal?.price ?? offer?.price ?? (target.model === 'scooter' ? 24000 : 0);
  const active = target.category === 'work' ? context.work.model === target.model : context.personal === target.model;
  const owned = target.category === 'work' ? work !== undefined : personal !== undefined && fleet.personal.includes(personal.id);
  const currentPersonal = personalCars.find(car => car.id === context.personal);
  const currentWork = context.work.model !== 'zhiguli' ? workModelOffer(context.work.model) : undefined;
  const tradePrice = target.category === 'personal' ? currentPersonal?.price : currentWork?.price;
  const tradeIn = tradePrice && price > tradePrice && target.model !== 'zhiguli' ? Math.round(tradePrice * 0.6) : 0;
  const blocked: string[] = [];
  if (personal && status < personal.status) blocked.push(`Социальный рейтинг · нужно ${personal.status}, сейчас ${status}`);
  if (personal && !context.cityVisit) blocked.push('Сходи в кино, ресторан или театр');
  if (offer && !context.firstAuctionDone) blocked.push('Заверши первые торги на скутере');
  const vehicle = work ?? offer?.next ?? (target.category === 'work' ? { model: 'scooter' } as const : undefined);
  return {
    target, price, owned, active, tradeIn, blocked,
    resale: Math.round(price * 0.6),
    saleBlock: target.category === 'work' && fleet.work.length === 1 ? 'Нужен ещё один рабочий транспорт для поездок.'
      : target.model === 'heavy' && ownedTrailers(fleet).length ? 'Этот тягач используется с твоими прицепами.' : null, fullMissing: Math.max(0, price - bank),
    tradeMissing: Math.max(0, price - tradeIn - bank),
    name: personal?.name ?? (target.category === 'work' ? transportNames[target.model] : ''),
    classLabel: target.category === 'work' ? workClasses[target.model] : personalClasses[target.model],
    goal: (target.category === 'work' ? fleet.workGoal : fleet.personalGoal) === target.model,
    statusRequired: personal?.status,
    trailerCapacity: undefined,
    vehicle: vehicle && describeVehicle(vehicle),
    auctions: vehicle && (hasBonusAuction(vehicle) ? 4 : 3),
    bulky: vehicle && (vehicle.model === 'pickup' || vehicle.model === 'van' || vehicle.model === 'heavy'),
  };
}

export function ownedTrailers(fleet: Fleet): readonly Trailer[] {
  if (fleet.trailers) return fleet.trailers;
  const heavy = fleet.work.find(entry => entry.model === 'heavy');
  return heavy?.trailer == null ? [] : [heavy.trailer];
}

export function trailerCard(context: ShowroomContext, model: Trailer) {
  const definition = trailerCatalog[model];
  if (!definition) return null;
  const heavy = context.fleet.work.find(entry => entry.model === 'heavy');
  const fullMissing = Math.max(0, definition.price - context.bank);
  return {
    ...definition,
    target: { category: 'trailers', model } as const,
    owned: ownedTrailers(context.fleet).includes(model),
    active: heavy?.trailer === model,
    blocked: heavy ? [] : ['Сначала купи тяжёлый пикап RAM.'],
    goal: context.fleet.trailerGoal === model,
    fullMissing,
    tradeIn: 0, tradeMissing: fullMissing, trailerCapacity: definition.capacity,
    statusRequired: undefined, vehicle: undefined, auctions: undefined, bulky: undefined,
  };
}

export function showroomView(context: ShowroomContext) {
  return {
    status: context.status,
    work: transportModels.map(model => showroomCard(context, { category: 'work', model })),
    personal: personalCars.map(({ id }) => showroomCard(context, { category: 'personal', model: id })),
    trailers: trailerIds.map(model => trailerCard(context, model)!),
  };
}
