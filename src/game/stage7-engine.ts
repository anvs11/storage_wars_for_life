import { finishOuting, getCalendarView, outingAvailable } from './stage7-calendar';
import type { CalendarState, CalendarView } from './stage7-calendar';
import { baggageItems, boxVolume, fleaCapacity, fleaEstimate, fleaMorning, initialFlea, packingBlock, returnable, sellAtFlea } from './stage7-flea';
import type { FleaState } from './stage7-flea';
import { visitActivity } from './stage7-events';
import type { VisitPhoto } from './stage7-events';
import { familyDateAtWake, pendingFamilyDateOn, scheduleFamilyDate } from './stage7-family';
import type { FamilyDate } from './stage7-family';
import { advanceRelationship, getRelationshipGoal } from './relationships';
import type { RelationshipGoal, RelationshipStep } from './stage4-contract';
import type { GarageItemView, Stage5Command, Stage5View } from './stage5-contract';
import { applyCommand as applyStage5, economyFor, finishCargo, getView as getStage5View, newGame as newStage5, settleSales, updateStage5, waitForOffers } from './stage5-engine';
import type { Stage5State } from './stage5-engine';

export interface Stage7State {
  readonly base: Stage5State;
  readonly calendar: CalendarState;
  readonly flea: FleaState;
  readonly paidVisit: VisitPhoto | null;
  readonly familyDate: FamilyDate | null;
}

type CalendarAction = 'waitUntilNextPeriod' | 'sleep' | 'wakeUp';
type FleaNavigation = 'openFleaVisit' | 'cancelFleaVisit' | 'confirmFleaVisit' | 'closeFleaReceipt';
type FleaPacking = 'packForFlea' | 'unpackFlea' | 'toggleFleaBaggage';
type PhotoAction = 'openVisitPhoto' | 'closeVisitPhoto';
type SimpleAction = CalendarAction | FleaNavigation | PhotoAction | 'giveBirthdayFlowers';

export type Stage7Command = Stage5Command | {
  [Action in SimpleAction]: { readonly type: Action; readonly expectedRevision: number };
}[SimpleAction] | {
  [Action in FleaPacking]: { readonly type: Action; readonly expectedRevision: number; readonly itemId: string };
}[FleaPacking];

export type Stage7Dispatch = (command: Stage7Command) => void;

export interface Stage7View {
  readonly screen: Stage5View;
  readonly calendar: CalendarView;
  readonly flea: FleaView;
  readonly paidVisit: VisitPhoto | null;
  readonly familyDate: FamilyDateView | null;
}

interface FamilyDateView extends FamilyDate {
  readonly affection: -1 | 0 | 1;
  readonly price: number;
  readonly advancesStory: boolean;
  readonly step: RelationshipStep;
  readonly status: number;
  readonly nextGoal: RelationshipGoal | null;
}

export interface FleaView {
  readonly items: readonly (Pick<GarageItemView, 'id' | 'name' | 'size' | 'estimate'> & { readonly canReturn: boolean })[];
  readonly packing: readonly { readonly id: string; readonly blocked: string | null; readonly selected: boolean }[];
  readonly used: number;
  readonly limit: number;
  readonly canVisit: boolean;
  readonly visit: FleaState['visit'];
}

export function migrateStage5(base: Stage5State): Stage7State {
  return { base, calendar: { day: 1, period: 'morning' }, flea: initialFlea(base), paidVisit: null,
    familyDate: base.base.relationshipStep === 'unmet' ? null : scheduleFamilyDate(1) };
}

export function newGame(seed?: number): Stage7State {
  return migrateStage5(newStage5(seed));
}

function confirmFleaVisit(state: Stage7State): Stage7State {
  const { base, calendar, flea } = state;
  if (!fleaMorning(calendar) || base.room !== 'home' || !flea.items.length) return state;
  const { seed, sold, remaining } = sellAtFlea(flea);
  const next = settleSales(base, sold, remaining);
  if (next === base) return state;
  return {
    ...state,
    base: next, calendar: finishOuting(calendar),
    flea: { ...flea, items: remaining, seed, visit: {
      phase: 'receipt', day: calendar.day, bankBefore: base.base.game.bank,
      sold: sold.map(({ item, price }) => ({ id: item.id, name: item.name, size: item.size, price })),
      revenue: sold.reduce((sum, { price }) => sum + price, 0),
    } },
  };
}

function packAtHome(state: Stage7State, command: Extract<Stage7Command, { type: 'packForFlea' | 'unpackFlea' }>): Stage7State {
  const { base, flea } = state;
  if (base.room !== 'garage') return state;
  if (command.type === 'packForFlea') {
    const item = base.items.find(({ id }) => id === command.itemId);
    if (!item || packingBlock(base, boxVolume(flea.items), item)) return state;
    return { ...state, base: updateStage5(base, { items: base.items.filter(({ id }) => id !== item.id) }),
      flea: { ...flea, items: [...flea.items, item] } };
  }
  const item = flea.items.find(({ id }) => id === command.itemId);
  if (!item || !returnable(base, item)) return state;
  return { ...state, base: updateStage5(base, { items: [...base.items, item] }),
    flea: { ...flea, items: flea.items.filter(({ id }) => id !== item.id) } };
}

function toggleBaggageBox(state: Stage7State, itemId: string): Stage7State {
  const { base, flea } = state;
  const items = baggageItems(base);
  const item = items.find(({ id }) => id === itemId);
  if (!item) return state;
  const selection = flea.baggageSelection;
  if (selection.includes(itemId)) {
    return { ...state, base: updateStage5(base, {}), flea: { ...flea, baggageSelection: selection.filter((id) => id !== itemId) } };
  }
  const used = boxVolume(flea.items) + boxVolume(items.filter(({ id }) => selection.includes(id)));
  if (packingBlock(base, used, item)) return state;
  return { ...state, base: updateStage5(base, {}), flea: { ...flea, baggageSelection: [...selection, itemId] } };
}

function giveBirthdayFlowers(state: Stage7State): Stage7State {
  const { base, calendar } = state;
  const profile = base.base;
  const familyDate = pendingFamilyDateOn(state.familyDate, calendar.day);
  if (!familyDate || profile.game.phase !== 'hub' ||
      (base.room !== 'home' && !profile.relationshipOpen)) return state;
  const economy = economyFor(base);
  if (profile.game.bank < economy.flowerPrice) return state;

  const celebrated: FamilyDate = { ...familyDate, outcome: 'celebrated' };
  if (profile.relationshipStep === 'met') {
    const advanced = advanceRelationship(profile.game, profile.relationshipStep, 'buyFlowers', economy);
    if (!advanced) return state;
    return { ...state, base: { ...base, base: { ...profile, ...advanced } }, familyDate: celebrated };
  }
  return { ...state, base: updateStage5(base, {}, profile.game.bank - economy.flowerPrice), familyDate: celebrated };
}

export function applyCommand(state: Stage7State, command: Stage7Command): Stage7State {
  const { base, calendar, flea, paidVisit, familyDate } = state;
  const profile = base.base;
  if (profile.game.revision !== command.expectedRevision) return state;

  if (paidVisit?.open) {
    if (command.type !== 'closeVisitPhoto') return state;
    return { ...state, base: updateStage5(base, {}), paidVisit: { ...paidVisit, open: false } };
  }

  if (flea.visit) {
    if (flea.visit.phase === 'offer' && command.type === 'confirmFleaVisit') return confirmFleaVisit(state);
    if ((flea.visit.phase === 'offer' && command.type === 'cancelFleaVisit') ||
        (flea.visit.phase === 'receipt' && command.type === 'closeFleaReceipt')) {
      return { ...state, base: updateStage5(base, {}), flea: { ...flea, visit: null } };
    }
    return state;
  }

  if (command.type === 'sleep' || command.type === 'wakeUp' || command.type === 'waitUntilNextPeriod') {
    if (base.room !== 'home' || base.opening !== null || profile.relationshipOpen || profile.game.phase !== 'hub') return state;
    if (command.type === 'waitUntilNextPeriod') {
      return outingAvailable(calendar.period)
        ? { ...state, base: waitForOffers(base), calendar: finishOuting(calendar) } : state;
    }
    if (command.type === 'sleep' && calendar.period !== 'evening') return state;
    if (command.type === 'wakeUp' && (calendar.period !== 'night' || calendar.day >= Number.MAX_SAFE_INTEGER)) return state;
    const awake = command.type === 'wakeUp';
    const day = awake ? calendar.day + 1 : calendar.day;
    return {
      ...state,
      base: updateStage5(base, {}),
      calendar: { day, period: awake ? 'morning' : 'night' },
      familyDate: awake ? familyDateAtWake(familyDate, day) : familyDate,
    };
  }

  if (calendar.period === 'night') return state;
  switch (command.type) {
    case 'giveBirthdayFlowers':
      return giveBirthdayFlowers(state);
    case 'buyFlowers':
      if (profile.relationshipOpen && profile.relationshipStep === 'met' && pendingFamilyDateOn(familyDate, calendar.day)) {
        return giveBirthdayFlowers(state);
      }
      break;
    case 'openVisitPhoto':
      if (base.room !== 'home' || !paidVisit) return state;
      return { ...state, base: updateStage5(base, {}), paidVisit: { ...paidVisit, open: true } };
    case 'closeVisitPhoto':
      return state;
    case 'openFleaVisit':
      if (base.room !== 'home' || !fleaMorning(calendar) || !flea.items.length) return state;
      return { ...state, base: updateStage5(base, {}), flea: { ...flea, visit: { phase: 'offer' } } };
    case 'cancelFleaVisit':
    case 'confirmFleaVisit':
    case 'closeFleaReceipt':
      return state;
    case 'packForFlea':
    case 'unpackFlea':
      return packAtHome(state, command);
    case 'toggleFleaBaggage':
      return toggleBaggageBox(state, command.itemId);
    case 'toggleCargo':
      if (flea.baggageSelection.includes(command.itemId)) return state;
      break;
    case 'finishCargo':
      if (flea.baggageSelection.length) {
        const delivery = finishCargo(base, command.leaveRemaining, flea.items, flea.baggageSelection);
        if (!delivery) return state;
        return { ...state, base: delivery.base,
          flea: { ...flea, items: [...flea.items, ...delivery.packed], baggageSelection: [] } };
      }
      break;
  }
  const visit = visitActivity(command);
  const waits = command.type === 'waitForBuyer';
  if ((command.type === 'enterAuction' || visit || waits) && !outingAvailable(calendar.period)) return state;
  const source = command.type === 'openRelationship' && base.room === 'home' ? { ...base, room: null } : base;
  const next = applyStage5(source, command, flea.items);
  if (next === source) return state;

  if (visit && (calendar.period === 'morning' || calendar.period === 'afternoon')) {
    const game = next.base.game;
    return {
      ...state, base: next, calendar: finishOuting(calendar),
      paidVisit: { open: true, record: {
        ...visit, day: calendar.day, outing: calendar.period, revision: game.revision,
        spent: profile.game.bank - game.bank, statusGain: game.status - profile.game.status,
      } },
    };
  }

  const auctionFinished = (command.type === 'nextLot' && profile.game.phase === 'result') ||
    (command.type === 'finishCargo' && profile.game.phase === 'reveal');
  return {
    ...state, base: next, calendar: waits || auctionFinished ? finishOuting(calendar) : calendar,
    familyDate: command.type === 'meetNeighbor' ? scheduleFamilyDate(calendar.day) : familyDate,
  };
}

export function getView(state: Stage7State): Stage7View {
  const { base, calendar, flea, familyDate } = state;
  const candidates = base.room === 'garage' ? base.items : baggageItems(base);
  const used = boxVolume(flea.items) + boxVolume(candidates.filter(({ id }) => flea.baggageSelection.includes(id)));
  const { game, relationshipStep: step } = base.base;
  const economy = economyFor(base);
  return {
    screen: getStage5View(base), calendar: getCalendarView(calendar), paidVisit: state.paidVisit,
    familyDate: familyDate && {
      ...familyDate, affection: familyDate.outcome === 'celebrated' ? 1 : familyDate.outcome === 'missed' ? -1 : 0,
      price: economy.flowerPrice, advancesStory: step === 'met', step, status: game.status,
      nextGoal: getRelationshipGoal(game, step, economy),
    },
    flea: {
      items: flea.items.map((item) => ({ id: item.id, name: item.name, size: item.size, estimate: fleaEstimate(item),
        canReturn: returnable(base, item) })),
      packing: candidates.map((item) => ({ id: item.id, selected: flea.baggageSelection.includes(item.id),
        blocked: flea.baggageSelection.includes(item.id) ? null : packingBlock(base, used, item) })),
      used, limit: fleaCapacity, canVisit: base.room === 'home' && fleaMorning(calendar) && flea.items.length > 0,
      visit: flea.visit,
    },
  };
}
