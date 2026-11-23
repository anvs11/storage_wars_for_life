import { offers } from '../game/progression';
import { rubleEconomy } from '../game/stage5-economy';
import { outingAvailable, periods } from '../game/stage7-calendar';
import type { CalendarState } from '../game/stage7-calendar';
import { isVenue } from '../game/stage7-events';
import type { VisitPhoto } from '../game/stage7-events';
import { scheduleFamilyDate } from '../game/stage7-family';
import type { FamilyDate } from '../game/stage7-family';
import { baggageItems, boxVolume, fleaCapacity, fleaMorning, initialFlea } from '../game/stage7-flea';
import type { FleaReceipt, FleaSale } from '../game/stage7-flea';
import type { Stage5State } from '../game/stage5-engine';
import { applyCommand, migrateStage5 } from '../game/stage7-engine';
import type { Stage7Command, Stage7State } from '../game/stage7-engine';
import { areIds, exactKeys, isMoney, isRecord, loadSnapshot, writeSnapshot } from './save';
import type { LoadResult, SavedCommandResult, SaveResult, SaveStorage } from './save';
import { decodeStage5, isOwned, isStage5State } from './stage5-save';

const version = 6;

function isCalendar(calendar: unknown, base: Stage5State): calendar is CalendarState {
  if (!isRecord(calendar) || !exactKeys(calendar, ['day', 'period']) || !isMoney(calendar.day) ||
      calendar.day < 1 || !periods.some((period) => period === calendar.period)) return false;
  const period = calendar.period as CalendarState['period'];
  const elapsed = periods.indexOf(period);
  // Каждая смена периода, включая сон и пробуждение, требует принятой команды.
  if (calendar.day - 1 > Math.floor((base.base.game.revision - elapsed) / periods.length)) return false;
  if (base.opening !== null) return calendar.day === 1 && period === 'morning';
  if (period === 'night') return base.room === 'home';
  return outingAvailable(period) || !('lot' in base.base.game);
}

type CalendarSnapshot = Pick<Stage7State, 'base' | 'calendar' | 'flea'>;

function readFleaReceipt(visit: Record<string, unknown>, snapshot: CalendarSnapshot): FleaReceipt | null {
  const { base, calendar, flea } = snapshot;
  // Первые снимки v6 записывали цены без исходного банка и объёма проданных вещей.
  const withBank = Object.hasOwn(visit, 'bankBefore');
  const keys = ['phase', 'day', 'sold', 'revenue'];
  if (withBank) keys.push('bankBefore');
  if (visit.phase !== 'receipt' || !exactKeys(visit, keys) || calendar.period !== 'afternoon' ||
      !fleaMorning({ ...calendar, period: 'morning' }) || visit.day !== calendar.day ||
      !isMoney(visit.revenue) || !Array.isArray(visit.sold) || visit.sold.length > fleaCapacity) return null;

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
  if (volume > fleaCapacity || volume === 0 || revenue !== visit.revenue || revenue > bank) return null;
  if (withBank && (!isMoney(visit.bankBefore) || visit.bankBefore !== bank - revenue)) return null;
  const last = sold.at(-1);
  if (last && (base.lastSale?.name !== last.name || base.lastSale.price !== last.price)) return null;
  return { phase: 'receipt', day: calendar.day, sold, revenue, ...(withBank ? { bankBefore: bank - revenue } : {}) };
}

function readCalendarSnapshot(value: Record<string, unknown>): CalendarSnapshot | null {
  const { base, calendar, flea } = value;
  if (exactKeys(value, ['base', 'calendar']) && isStage5State(base) && isCalendar(calendar, base)) {
    return { base, calendar, flea: initialFlea(base) };
  }
  if (!exactKeys(value, ['base', 'calendar', 'flea']) || !isRecord(flea) ||
      !exactKeys(flea, ['items', 'seed', 'baggageSelection', 'visit'])) return null;
  const { items, seed, baggageSelection, visit } = flea;
  if (!isMoney(seed) || seed > 0xffffffff || !Array.isArray(items) || !items.every(isOwned) ||
      !isStage5State(base, items) || !isCalendar(calendar, base)) return null;
  const bag = baggageItems(base);
  if (!areIds(baggageSelection, bag.filter(({ id }) => !base.cargo.includes(id)).map(({ id }) => id)) ||
      boxVolume(items) + boxVolume(bag.filter(({ id }) => baggageSelection.includes(id))) > fleaCapacity) return null;
  const snapshot: CalendarSnapshot = { base, calendar, flea: { items, seed, baggageSelection, visit: null } };
  if (visit === null) return snapshot;
  if (base.room !== 'home' || baggageSelection.length || !isRecord(visit)) return null;
  if (visit.phase === 'offer' && exactKeys(visit, ['phase']) && fleaMorning(calendar) && items.length) {
    return { base, calendar, flea: { items, seed, baggageSelection, visit: { phase: 'offer' } } };
  }
  const receipt = readFleaReceipt(visit, snapshot);
  return receipt ? { ...snapshot, flea: { ...snapshot.flea, visit: receipt } } : null;
}

function isVisitPhoto(value: unknown, snapshot: CalendarSnapshot): value is VisitPhoto {
  if (!isRecord(value) || !exactKeys(value, ['record', 'open']) || typeof value.open !== 'boolean' ||
      !isRecord(value.record) || !exactKeys(value.record, ['venue', 'together', 'day', 'outing', 'spent', 'statusGain', 'revision'])) return false;
  const { venue, together, day, outing, spent, statusGain, revision } = value.record;
  const { base, calendar, flea } = snapshot;
  const profile = base.base;
  if (!isVenue(venue) || typeof together !== 'boolean' || !isMoney(day) || day < 1 || day > calendar.day ||
      (outing !== 'morning' && outing !== 'afternoon') || spent !== rubleEconomy.offerPrice(venue) ||
      !isMoney(statusGain) || statusGain !== offers[venue].statusGain || profile.game.status < statusGain ||
      !isMoney(revision) || revision === 0 || revision > profile.game.revision || base.opening !== null) return false;
  const periodAfterPayment = outing === 'morning' ? 'afternoon' : 'evening';
  const paymentPeriod = periods.indexOf(periodAfterPayment);
  const elapsed = (calendar.day - day) * periods.length + periods.indexOf(calendar.period) - paymentPeriod;
  if (elapsed < 0 || profile.game.revision - revision < elapsed ||
      day - 1 > Math.floor((revision - paymentPeriod) / periods.length)) return false;
  if (together && (
    venue === 'cinema' ? !['cinemaVisited', 'dinnerVisited', 'movedIn'].includes(profile.relationshipStep)
      : venue !== 'restaurant' || !['dinnerVisited', 'movedIn'].includes(profile.relationshipStep)
  )) return false;
  if (!value.open) return true;
  if (flea.visit || calendar.period === 'night' || profile.game.phase !== 'hub') return false;
  if (revision < profile.game.revision) return base.room === 'home';
  return base.room === null && profile.relationshipOpen === together && day === calendar.day &&
    calendar.period === periodAfterPayment;
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

function readStage7(value: unknown): Stage7State | null {
  if (!isRecord(value)) return null;
  const { paidVisit = null, familyDate: savedDate, ...core } = value;
  const snapshot = readCalendarSnapshot(core);
  if (!snapshot || (paidVisit !== null && !isVisitPhoto(paidVisit, snapshot))) return null;
  const familyDate = savedDate === undefined && snapshot.base.base.relationshipStep !== 'unmet'
    ? scheduleFamilyDate(snapshot.calendar.day) : savedDate ?? null;
  if (!isFamilyDate(familyDate, snapshot)) return null;
  return { ...snapshot, paidVisit, familyDate };
}

function decode(serialized: string | null): Stage7State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (isRecord(value) && value.version === version) return readStage7(value.state);
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

export function applySavedCommand(storage: SaveStorage, state: Stage7State, command: Stage7Command): SavedCommandResult<Stage7State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
