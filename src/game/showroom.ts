import { personalCars } from './personal-cars';
import type { PersonalCar } from './personal-cars';
import { describeVehicle, hasBonusAuction, transportModels, transportNames, workModelOffer } from './transport';
import type { TransportModel, TransportState } from './transport';

export type ShowroomTarget = { readonly category: 'personal'; readonly model: PersonalCar }
  | { readonly category: 'work'; readonly model: TransportModel };

export interface Fleet {
  readonly work: readonly TransportState[];
  readonly personal: readonly PersonalCar[];
  readonly workGoal?: TransportModel;
  readonly personalGoal?: PersonalCar;
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

export function showroomCard(context: ShowroomContext, target: ShowroomTarget) {
  const { fleet, bank, status } = context;
  const personal = target.category === 'personal' ? personalCars.find(car => car.id === target.model) : undefined;
  const work = target.category === 'work' ? fleet.work.find(car => car.model === target.model) : undefined;
  const offer = target.category === 'work' ? workModelOffer(target.model) : undefined;
  const price = personal?.price ?? offer?.price ?? 0;
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
    target, price, owned, active, tradeIn, blocked, fullMissing: Math.max(0, price - bank),
    tradeMissing: Math.max(0, price - tradeIn - bank),
    name: personal?.name ?? (target.category === 'work' ? transportNames[target.model] : ''),
    classLabel: target.category === 'work' ? workClasses[target.model] : personalClasses[target.model],
    goal: (target.category === 'work' ? fleet.workGoal : fleet.personalGoal) === target.model,
    statusRequired: personal?.status,
    vehicle: vehicle && describeVehicle(vehicle),
    auctions: vehicle && (hasBonusAuction(vehicle) ? 4 : 3),
    bulky: vehicle && (vehicle.model === 'pickup' || vehicle.model === 'van' || vehicle.model === 'heavy'),
  };
}

export function showroomView(context: ShowroomContext) {
  return {
    status: context.status,
    work: transportModels.map(model => showroomCard(context, { category: 'work', model })),
    personal: personalCars.map(({ id }) => showroomCard(context, { category: 'personal', model: id })),
  };
}
