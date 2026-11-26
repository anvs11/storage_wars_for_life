import { offers } from '../game/progression';
import { updateLegacyReview } from '../game/market-dialogue';
import { rubleEconomy } from '../game/stage5-economy';
import { outingAvailable, outingPeriods, periodAfterOuting, periods } from '../game/stage7-calendar';
import type { CalendarState, OutingPeriod, Period } from '../game/stage7-calendar';
import { isVenue } from '../game/stage7-events';
import type { VisitPhoto } from '../game/stage7-events';
import { scheduleFamilyDate } from '../game/stage7-family';
import type { FamilyDate } from '../game/stage7-family';
import { baggageItems, boxVolume, fleaCapacity, fleaMorning, initialFlea } from '../game/stage7-flea';
import type { FleaReceipt, FleaSale } from '../game/stage7-flea';
import { economyFor, transportFor } from '../game/stage5-engine';
import { hasBonusAuction, transportModels } from '../game/transport';
import type { TransportState } from '../game/transport';
import type { Fleet } from '../game/showroom';
import { isTurntable, lifeChoices, lifeEvents, lifeStats, weekOf } from '../game/life';
import type { LifeState } from '../game/life';
import { personalCars } from '../game/personal-cars';
import { isStage3State } from './stage3-save';
import type { Stage5State } from '../game/stage5-engine';
import { applyCommand, migrateStage5 } from '../game/stage7-engine';
import type { ParkedLot, Stage7Command, Stage7State } from '../game/stage7-engine';
import { areIds, BACKUP_KEY, exactKeys, isMoney, isRecord, loadSnapshot, SAVE_KEY, writeSnapshot } from './save';
import type { LoadResult, SavedCommandResult, SaveResult, SaveStorage } from './save';
import { decodeStage5, isOwned, isStage5State, isTransport } from './stage5-save';

const version = 7;
const previousPeriods = ['morning', 'afternoon', 'evening', 'night'] as const;
const minimumPeriod = (period: Period): number => period === 'lateAfternoon' ? 2 : previousPeriods.indexOf(period);

function isCalendar(calendar: unknown, base: Stage5State, fromParking = false, bonusUsed = false): calendar is CalendarState {
  if (!isRecord(calendar) || !exactKeys(calendar, ['day', 'period']) || !isMoney(calendar.day) ||
      calendar.day < 1 || !periods.some((period) => period === calendar.period)) return false;
  const period = calendar.period as CalendarState['period'];
  // Старые дни могли занимать четыре перехода даже после обновления сохранения.
  if (calendar.day - 1 > Math.floor((base.base.game.revision - minimumPeriod(period)) / previousPeriods.length)) return false;
  if (base.opening !== null) return calendar.day === 1 && period === 'morning';
  if (period === 'night') return base.room === 'home';
  const game = base.base.game;
  return outingAvailable(period) || !('lot' in game) || fromParking && game.phase === 'reveal' ||
    hasBonusAuction(transportFor(base)) && (bonusUsed || game.phase === 'recovery');
}

type CalendarSnapshot = Pick<Stage7State, 'base' | 'calendar' | 'flea'>;

function readFleaReceipt(visit: Record<string, unknown>, snapshot: CalendarSnapshot, fleaLimit: number): FleaReceipt | null {
  const { base, calendar, flea } = snapshot;
  // Первые снимки v6 записывали цены без исходного банка и объёма проданных вещей.
  const withBank = Object.hasOwn(visit, 'bankBefore');
  const keys = ['phase', 'day', 'sold', 'revenue'];
  if (withBank) keys.push('bankBefore');
  if (visit.phase !== 'receipt' || !exactKeys(visit, keys) || calendar.period !== 'afternoon' ||
      !fleaMorning({ ...calendar, period: 'morning' }) || visit.day !== calendar.day ||
      !isMoney(visit.revenue) || !Array.isArray(visit.sold) || visit.sold.length > fleaLimit) return null;

  const known = new Set([...flea.items, ...base.items].map(({ id }) => id));
  const sold: FleaSale[] = [];
  let volume = boxVolume(flea.items);
  let revenue = 0;
  const lineKeys = withBank ? ['id', 'name', 'price', 'size'] : ['id', 'name', 'price'];
  for (const line of visit.sold as unknown[]) {
    if (!isRecord(line) || !exactKeys(line, lineKeys) || typeof line.id !== 'string' || known.has(line.id) ||
        typeof line.name !== 'string' || !isMoney(line.price) || line.price === 0) return null;
    const { id, name, price, size } = line;
    if (withBank && size !== 1 && size !== 2 && size !== 4) return null;
    known.add(id);
    sold.push({ id, name, price, ...(size === 1 || size === 2 || size === 4 ? { size } : {}) });
    volume += typeof size === 'number' ? size : 1;
    revenue += price;
  }
  const bank = base.base.game.bank;
  if (volume > fleaLimit || volume === 0 || revenue !== visit.revenue || revenue > bank) return null;
  if (withBank && (!isMoney(visit.bankBefore) || visit.bankBefore !== bank - revenue)) return null;
  const last = sold.at(-1);
  if (last && (base.lastSale?.name !== last.name || base.lastSale.price !== last.price)) return null;
  return { phase: 'receipt', day: calendar.day, sold, revenue, ...(withBank ? { bankBefore: bank - revenue } : {}) };
}

function readCalendarSnapshot(value: Record<string, unknown>, fleaLimit: number, lastAuctionNumber?: number, bonusUsed = false): CalendarSnapshot | null {
  const { base, calendar, flea } = value;
  if (exactKeys(value, ['base', 'calendar']) && isStage5State(base) && isCalendar(calendar, base)) {
    return { base, calendar, flea: initialFlea(base) };
  }
  if (!exactKeys(value, ['base', 'calendar', 'flea']) || !isRecord(flea) ||
      !exactKeys(flea, ['items', 'seed', 'baggageSelection', 'visit'])) return null;
  const { items, seed, baggageSelection, visit } = flea;
  if (!isMoney(seed) || seed > 0xffffffff || !Array.isArray(items) || !items.every(isOwned) ||
      !isStage5State(base, items, lastAuctionNumber) || !isCalendar(calendar, base, lastAuctionNumber !== undefined, bonusUsed)) return null;
  const bag = baggageItems(base);
  if (!areIds(baggageSelection, bag.filter(({ id }) => !base.cargo.includes(id)).map(({ id }) => id)) ||
      boxVolume(items) + boxVolume(bag.filter(({ id }) => baggageSelection.includes(id))) > fleaLimit) return null;
  const snapshot: CalendarSnapshot = { base, calendar, flea: { items, seed, baggageSelection, visit: null } };
  if (visit === null) return snapshot;
  if (base.room !== 'home' || baggageSelection.length || !isRecord(visit)) return null;
  if (visit.phase === 'offer' && exactKeys(visit, ['phase']) && fleaMorning(calendar) && items.length) {
    return { base, calendar, flea: { items, seed, baggageSelection, visit: { phase: 'offer' } } };
  }
  const receipt = readFleaReceipt(visit, snapshot, fleaLimit);
  return receipt ? { ...snapshot, flea: { ...snapshot.flea, visit: receipt } } : null;
}

function isVisitPhoto(value: unknown, snapshot: CalendarSnapshot): value is VisitPhoto {
  if (!isRecord(value) || !exactKeys(value, ['record', 'open']) || typeof value.open !== 'boolean' ||
      !isRecord(value.record) || !exactKeys(value.record, ['venue', 'together', 'day', 'outing', 'spent', 'statusGain', 'revision'])) return false;
  const { venue, together, day, outing, spent, statusGain, revision } = value.record;
  const { base, calendar, flea } = snapshot;
  const profile = base.base;
  if (!isVenue(venue) || typeof together !== 'boolean' || !isMoney(day) || day < 1 || day > calendar.day ||
      !outingPeriods.some(period => period === outing) || spent !== rubleEconomy.offerPrice(venue) ||
      !isMoney(statusGain) || statusGain !== offers[venue].statusGain || profile.game.status < statusGain ||
      !isMoney(revision) || revision === 0 || revision > profile.game.revision || base.opening !== null) return false;
  const periodAfterPayment = periodAfterOuting(outing as OutingPeriod);
  const paymentPeriod = minimumPeriod(periodAfterPayment);
  if (calendar.day === day && periods.indexOf(calendar.period) < periods.indexOf(periodAfterPayment)) return false;
  const elapsed = (calendar.day - day) * previousPeriods.length + minimumPeriod(calendar.period) - paymentPeriod;
  if (elapsed < 0 || profile.game.revision - revision < elapsed ||
      day - 1 > Math.floor((revision - paymentPeriod) / previousPeriods.length)) return false;
  if (together && (
    venue === 'cinema' ? !['cinemaVisited', 'dinnerVisited', 'movedIn'].includes(profile.relationshipStep)
      : venue !== 'restaurant' || !['dinnerVisited', 'movedIn'].includes(profile.relationshipStep)
  )) return false;
  if (!value.open) return true;
  if (flea.visit || calendar.period === 'night' || profile.game.phase !== 'hub') return false;
  if (revision < profile.game.revision) return base.room === 'home';
  // В v6 дневная поездка переводила игрока сразу на вечер.
  const legacyEvening = outing === 'afternoon' && calendar.period === 'evening';
  return base.room === null && profile.relationshipOpen === together && day === calendar.day &&
    (calendar.period === periodAfterPayment || legacyEvening);
}

function isFamilyDate(value: unknown, snapshot: CalendarSnapshot): value is FamilyDate | null {
  const { calendar, base } = snapshot;
  const step = base.base.relationshipStep;
  if (value === null) return step === 'unmet' || scheduleFamilyDate(calendar.day) === null;
  if (step === 'unmet' || !isRecord(value) || !exactKeys(value, ['day', 'outcome']) ||
      !isMoney(value.day) || value.day < 7 || value.day % 7 !== 0) return false;
  switch (value.outcome) {
    case 'pending': return value.day >= calendar.day && value.day - calendar.day <= 8;
    case 'celebrated': return value.day <= calendar.day && step !== 'met';
    case 'missed': return value.day < calendar.day;
    default: return false;
  }
}

function isLife(value: unknown, { base, calendar }: CalendarSnapshot): value is LifeState {
  if (!isRecord(value)) return false;
  const { seen, last, broken, promise, recommendedWeek, displayId, ...stats } = value;
  if (!exactKeys(stats, lifeStats) || !lifeStats.every(stat => {
    const score = stats[stat];
    return isMoney(score) && score <= 5;
  }) || !areIds(seen, lifeEvents)) return false;
  if (last !== undefined && !lifeChoices.some(choice => choice === last)) return false;
  if (seen.includes('intro') !== (base.base.relationshipStep !== 'unmet')) return false;
  if (seen.some(id => id !== 'intro') && !seen.includes('intro')) return false;
  if (broken !== undefined && (broken !== true || promise !== undefined)) return false;
  if (recommendedWeek !== undefined && (!isMoney(recommendedWeek) || recommendedWeek > weekOf(calendar.day))) return false;
  if (displayId !== undefined && (typeof displayId !== 'string' || !base.base.game.assets.includes('home') ||
      !base.items.some(item => item.id === displayId && isTurntable(item) && item.condition !== 'damaged') ||
      base.listings.some(listing => listing.itemId === displayId))) return false;
  if (promise === undefined) return true;
  if (!isRecord(promise) || !isMoney(promise.due) || promise.due < calendar.day || promise.due - calendar.day > 3) return false;
  if (promise.kind === 'listening') return exactKeys(promise, ['kind', 'itemId', 'due']) && seen.includes('turntable') &&
    typeof promise.itemId === 'string' && base.items.some(item => item.id === promise.itemId && isTurntable(item));
  return promise.kind === 'camera' && exactKeys(promise, ['kind', 'due']) && seen.includes('request');
}

function isFleet(value: unknown, active: TransportState, personal: unknown, cityVisit: unknown, status: number): value is Fleet {
  if (!isRecord(value) || !exactKeys(value, [
    'work', 'personal', ...(Object.hasOwn(value, 'workGoal') ? ['workGoal'] : []),
    ...(Object.hasOwn(value, 'personalGoal') ? ['personalGoal'] : []),
  ])) return false;
  if (!Array.isArray(value.work) || value.work.length > transportModels.length || !value.work.every(isTransport)) return false;
  const models = value.work.map(entry => entry.model);
  const stored = value.work.find(entry => entry.model === active.model);
  if (!stored || !models.includes('scooter') || new Set(models).size !== models.length) return false;
  if (active.model === 'heavy' && (stored.model !== 'heavy' || stored.engine !== active.engine || stored.trailer !== active.trailer)) return false;
  const ids = personalCars.map(car => car.id);
  const owned = value.personal;
  if (!areIds(owned, ids) || (personal === undefined ? owned.length !== 0 :
    typeof personal !== 'string' || !owned.includes(personal))) return false;
  if (owned.length && (cityVisit !== true || personalCars.some(car => owned.includes(car.id) && status < car.status))) return false;
  return (value.workGoal === undefined || transportModels.some(model => model === value.workGoal)) &&
    (value.personalGoal === undefined || ids.some(id => id === value.personalGoal));
}

function readStage7(value: unknown, fleaLimit = fleaCapacity): Stage7State | null {
  if (!isRecord(value)) return null;
  const { paidVisit = null, familyDate: savedDate, jobUnlocked, parkedLots, lastAuctionNumber, bonusAuctionUsed, life, cityVisit, personalCar, fleet, ...core } = value;
  if (lastAuctionNumber !== undefined && !isMoney(lastAuctionNumber)) return null;
  const snapshot = readCalendarSnapshot(core, fleaLimit, lastAuctionNumber, bonusAuctionUsed === true);
  if (!snapshot || (paidVisit !== null && !isVisitPhoto(paidVisit, snapshot))) return null;
  if (life !== undefined && !isLife(life, snapshot)) return null;
  const game = snapshot.base.base.game;
  if (game.phase === 'prologue') return null;
  if ((cityVisit !== undefined && cityVisit !== true) || (cityVisit === true && snapshot.base.opening !== null)) return null;
  const car = personalCars.find(({ id }) => id === personalCar);
  if (personalCar !== undefined && (!car || cityVisit !== true || game.status < car.status)) return null;
  const activeWork = transportFor(snapshot.base);
  if (fleet !== undefined && (snapshot.base.opening !== null || !isFleet(fleet, activeWork, personalCar, cityVisit, game.status))) return null;
  if (bonusAuctionUsed !== undefined && (bonusAuctionUsed !== true ||
    (snapshot.calendar.period !== 'evening' && snapshot.calendar.period !== 'night') ||
    !(fleet?.work.some(hasBonusAuction) ?? hasBonusAuction(activeWork)))) return null;
  const latestLot = lastAuctionNumber ?? game.lotNumber;
  if (lastAuctionNumber !== undefined && (game.phase !== 'reveal' || latestLot < game.lotNumber || latestLot > game.revision)) return null;
  if (parkedLots !== undefined) {
    if (!Array.isArray(parkedLots) || parkedLots.length > latestLot) return null;
    const seen = new Set<number>();
    for (const parked of parkedLots) {
      if (!isRecord(parked) || !isRecord(parked.game) || parked.game.phase !== 'reveal' ||
          typeof parked.legacyLot !== 'boolean' || (parked.lotEdition !== 5 && parked.lotEdition !== 6 && parked.lotEdition !== 7) ||
          !isStage3State(parked.game,
            economyFor({ legacyLot: parked.legacyLot, lotEdition: parked.lotEdition }), true)) return null;
      const { lotNumber, revision } = (parked as unknown as ParkedLot).game;
      if (lotNumber > latestLot || revision >= game.revision || seen.has(lotNumber) ||
          ('lot' in game && lotNumber === game.lotNumber) || snapshot.base.deals.some(deal => deal.lotNumber === lotNumber)) return null;
      seen.add(lotNumber);
    }
  }
  if (jobUnlocked !== undefined && (jobUnlocked !== true || snapshot.base.base.game.phase !== 'recovery')) return null;
  const familyDate = savedDate === undefined && snapshot.base.base.relationshipStep !== 'unmet'
    ? scheduleFamilyDate(snapshot.calendar.day) : savedDate ?? null;
  if (!isFamilyDate(familyDate, snapshot)) return null;
  const reviews = snapshot.base.reviews;
  const normalized = reviews ? { ...snapshot.base, reviews: reviews.map(updateLegacyReview) } : snapshot.base;
  return { ...snapshot, base: normalized, paidVisit, familyDate, ...(jobUnlocked === true ? { jobUnlocked } : {}),
    ...(life ? { life } : {}),
    ...(car ? { personalCar: car.id } : {}), ...(cityVisit === true ? { cityVisit } : {}),
    ...(fleet ? { fleet } : {}),
    ...(bonusAuctionUsed === true ? { bonusAuctionUsed } : {}),
    ...(Array.isArray(parkedLots) ? { parkedLots } : {}), ...(lastAuctionNumber === undefined ? {} : { lastAuctionNumber }) };
}

function decode(serialized: string | null): Stage7State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (isRecord(value)) {
      if (value.version === version) return readStage7(value.state);
      if (value.version === 6) return readStage7(value.state, 4);
    }
    const previous = decodeStage5(serialized);
    return previous ? migrateStage5(previous) : null;
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult<Stage7State> {
  return loadSnapshot(storage, decode);
}

export function save(storage: SaveStorage, state: Stage7State): SaveResult {
  if (!readStage7(state)) return { ok: false, message: 'Не удалось проверить новое сохранение. Повторите действие.' };
  return writeSnapshot(storage, { version, state }, decode);
}

export function resetSave(storage: SaveStorage, fresh: Stage7State): SaveResult {
  const serialized = JSON.stringify({ version, state: fresh });
  try {
    const backup = storage.getItem(BACKUP_KEY);
    storage.setItem(BACKUP_KEY, serialized);
    try {
      storage.setItem(SAVE_KEY, serialized);
    } catch {
      storage.setItem(BACKUP_KEY, backup ?? storage.getItem(SAVE_KEY) ?? '');
      throw new Error('Primary save failed');
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Не удалось начать заново. Повторите действие.' };
  }
}

export function applySavedCommand(storage: SaveStorage, state: Stage7State, command: Stage7Command): SavedCommandResult<Stage7State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
