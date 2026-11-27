import type { Stage7State } from './stage7-engine';
import { initialLife, isTurntable, lifeStats, weekOf } from './life';
import { finishOuting, outingAvailable } from './stage7-calendar';
import { economyFor, settleSales, updateStage5 } from './stage5-engine';
import { applySpending } from './stage3-engine';
import { phoneTopics } from './phone-dialogue';
import type { PhoneTopic } from './phone-dialogue';

type Scores = Record<typeof lifeStats[number], number>;
type Meeting = 'walk' | 'cinema';
export const contactStatus = 45;
export const orderBudget = 18000;
export const phoneChoices = ['read', 'reply', 'text', 'answer', 'skipCall', 'callBackLater', 'declineCall', 'call',
  'bookWalk', 'bookCinema', 'attend', 'reschedule', 'cancel', 'apologize', 'friendship', 'mutual', 'commit', 'introduce', 'sell'] as const;
export type PhoneChoice = typeof phoneChoices[number];
export interface PhoneCommand {
  readonly type: 'phone';
  readonly choice: PhoneChoice;
  readonly target?: number;
  readonly expectedRevision: number;
}

interface Message {
  readonly id: number;
  readonly topic: PhoneTopic;
  readonly variant: number;
  readonly day: number;
  readonly choice?: PhoneChoice;
}
interface Call {
  readonly id: number;
  readonly due: number | null;
  readonly promised?: true;
  readonly hidden?: true;
}
export interface PhoneState {
  readonly scores: Scores;
  readonly consent: 'friends' | 'mutual' | 'close';
  readonly milestone: boolean;
  readonly messages: readonly Message[];
  readonly read: number;
  readonly call?: Call;
  readonly meeting?: { readonly id: number; readonly kind: Meeting; readonly day: number; readonly moved?: true };
  readonly order?: { readonly id: number; readonly itemId: string; readonly itemName: string; readonly price: number; readonly due: number };
  readonly contact?: true;
  readonly orderWeek?: number;
  readonly callDay?: number;
  readonly talkDay?: number;
  readonly meetDay?: number;
  readonly penaltyDay?: number;
  readonly socialMeeting?: true;
  readonly conflict?: true;
}

export function initialPhone(state: Stage7State): PhoneState {
  const step = state.base.base.relationshipStep;
  const life = state.life ?? initialLife(step);
  return {
    scores: {
      trust: 30 + 14 * life.trust, interest: 30 + 14 * life.interest,
      reliability: 30 + 14 * life.reliability, memories: 30 + 14 * life.memories,
    },
    consent: step === 'movedIn' ? 'close' : 'friends', milestone: step === 'movedIn', messages: [], read: 0,
    ...(life.recommendedWeek !== undefined ? { contact: true } : {}),
  };
}

export const phoneFor = (state: Stage7State): PhoneState => state.phone ?? initialPhone(state);
const weightedScore = ({ trust, interest, reliability, memories }: Scores) => 35 * trust + 25 * interest + 25 * reliability + 15 * memories;
export const relationshipScore = (phone: PhoneState) => Math.floor(weightedScore(phone.scores) / 100);
export function relationshipTier(phone: PhoneState): string {
  const score = weightedScore(phone.scores);
  if (score < 2500) return 'Охлаждение';
  if (score >= 8000 && phone.consent === 'close' && phone.milestone) return 'Близкие отношения';
  if (score >= 5000 && phone.consent !== 'friends') return 'Взаимная симпатия';
  return 'Дружба';
}

export function phoneAvailable(state: Stage7State): boolean {
  return state.base.opening === null && state.base.base.game.phase === 'hub' &&
    !state.base.base.relationshipOpen && state.calendar.period !== 'night' && !state.paidVisit?.open && !state.flea.visit;
}

function change(phone: PhoneState, effect: Partial<Scores>): PhoneState {
  const scores = { ...phone.scores };
  for (const key of lifeStats) scores[key] = Math.max(0, Math.min(100, scores[key] + (effect[key] ?? 0)));
  return { ...phone, scores };
}

function addMessage(phone: PhoneState, topic: PhoneTopic, id: number, day: number, choice?: PhoneChoice): PhoneState {
  return { ...phone, messages: [...phone.messages.slice(-23), {
    id, topic, day, variant: (id + day) % phoneTopics[topic].length, ...(choice ? { choice } : {}),
  }] };
}

function penalize(phone: PhoneState, day: number): PhoneState {
  return phone.penaltyDay === day ? phone : {
    ...change(phone, { trust: -8, reliability: -12, interest: -3 }), penaltyDay: day, conflict: true,
  };
}

function suitableItem(state: Stage7State, id?: string) {
  return state.base.items.find(item => (id === undefined || item.id === id) && isTurntable(item) &&
    item.condition === 'good' && state.life?.displayId !== item.id && state.life?.promise?.itemId !== item.id &&
    Math.round(item.value * 1.15) > 0 && Math.round(item.value * 1.15) <= orderBudget);
}

function contactAvailable(state: Stage7State, phone: PhoneState): boolean {
  return state.base.base.game.status >= contactStatus || relationshipTier(phone) === 'Близкие отношения';
}

export function phoneView(state: Stage7State) {
  const phone = phoneFor(state);
  const { game, relationshipStep } = state.base.base;
  const { day, period } = state.calendar;
  const known = relationshipStep !== 'unmet';
  const latest = phone.messages.at(-1);
  const score = weightedScore(phone.scores);
  const cinemaPrice = economyFor(state.base).offerPrice('cinema');
  return {
    available: phoneAvailable(state), known, canMeetNeighbor: game.status >= 8,
    score: relationshipScore(phone), tier: relationshipTier(phone), status: game.status,
    sellerRating: state.base.reviews?.length
      ? (state.base.reviews.reduce((sum, { stars }) => sum + stars, 0) / state.base.reviews.length).toFixed(1).replace('.', ',') : null,
    messages: phone.messages.map(message => ({ ...message, text: phoneTopics[message.topic][message.variant]! })),
    unread: phone.messages.filter(({ id }) => id > phone.read).length,
    canReply: known && Boolean(latest && !latest.choice && latest.day === day) && phone.talkDay !== day && !phone.conflict,
    canText: known && phone.talkDay !== day && !phone.conflict, canCall: known && phone.talkDay !== day && !phone.conflict,
    call: phone.call ? { ...phone.call, text: phoneTopics.call[phone.call.id % phoneTopics.call.length]! } : undefined,
    meeting: phone.meeting, canBook: known && !phone.conflict && score >= 2500 && !phone.meeting &&
      phone.meetDay !== day && day < Number.MAX_SAFE_INTEGER,
    cinemaPrice, canCinema: game.bank >= cinemaPrice && game.status >= 8 && outingAvailable(period),
    canAttend: Boolean(phone.meeting && phone.meeting.day === day &&
      (phone.meeting.kind === 'walk' || game.bank >= cinemaPrice && game.status >= 8 && outingAvailable(period))),
    conflict: phone.conflict === true, canFriendship: phone.consent !== 'friends',
    canMutual: phone.consent === 'friends' && score >= 5000 && !phone.conflict,
    canCommit: phone.consent === 'mutual' && phone.milestone && score >= 8000 && !phone.conflict,
    contact: phone.contact === true, canIntroduce: !phone.contact && contactAvailable(state, phone),
    order: phone.order, canSell: Boolean(phone.order && day <= phone.order.due && suitableItem(state, phone.order.itemId)),
  };
}

export function applyPhone(state: Stage7State, command: PhoneCommand): Stage7State {
  if (!phoneAvailable(state)) return state;
  const { day, period } = state.calendar;
  const { base } = state;
  const { game } = base.base;
  if (game.phase !== 'hub') return state;
  const view = phoneView(state);
  const phone = phoneFor(state);
  const id = game.revision + 1;
  let next: PhoneState;
  switch (command.choice) {
    case 'read': {
      const last = phone.messages.at(-1)?.id ?? 0;
      if (!view.unread || command.target !== last) return state;
      next = { ...phone, read: last };
      break;
    }
    case 'reply':
    case 'text':
    case 'call': {
      const last = phone.messages.at(-1);
      const choice = command.choice;
      if (choice === 'reply' ? !view.canReply || last?.id !== command.target : !view.canText) return state;
      next = addMessage({ ...change(phone, { interest: 4, ...(choice === 'reply' ? { reliability: 3 } : {}) }),
        talkDay: day, read: id }, choice === 'call' ? 'outgoing' : 'hello', id, day, choice);
      break;
    }
    case 'skipCall':
    case 'callBackLater':
    case 'declineCall':
    case 'answer': {
      const { call, ...rest } = phone;
      if (!call || call.id !== command.target || call.due === null || day > call.due) return state;
      if (command.choice === 'skipCall' || command.choice === 'callBackLater') {
        if (command.choice === 'callBackLater' ? call.promised || day >= Number.MAX_SAFE_INTEGER : call.hidden) return state;
        next = { ...rest, call: { ...call, hidden: true, ...(command.choice === 'callBackLater' ? { promised: true, due: day + 1 } : {}) } };
      } else next = addMessage({ ...(command.choice === 'answer'
        ? change(rest, { trust: 3, interest: 4, reliability: call.promised ? 9 : 4 }) : rest), read: id },
      command.choice === 'answer' ? 'outgoing' : 'decline', id, day, command.choice);
      break;
    }
    case 'bookWalk':
    case 'bookCinema':
      if (!view.canBook || (command.choice === 'bookCinema' && !view.canCinema)) return state;
      next = { ...phone, meeting: { id, kind: command.choice === 'bookWalk' ? 'walk' : 'cinema', day } };
      break;
    case 'reschedule':
    case 'cancel':
    case 'attend': {
      const { meeting, ...rest } = phone;
      if (!meeting || meeting.id !== command.target) return state;
      if (command.choice === 'cancel') {
        next = rest;
        break;
      }
      if (command.choice === 'reschedule') {
        if (meeting.moved || day >= Number.MAX_SAFE_INTEGER) return state;
        next = { ...rest, meeting: { ...meeting, day: day + 1, moved: true } };
        break;
      }
      if (!view.canAttend) return state;
      const paid = meeting.kind === 'cinema' ? applySpending(game, 'cinema', economyFor(base)) : game;
      if (meeting.kind === 'cinema' && paid === game) return state;
      const award = meeting.kind === 'walk' && !phone.socialMeeting ? 2 : 0;
      if (!Number.isSafeInteger(paid.status + award)) return state;
      next = addMessage({ ...change(rest, { trust: 11, interest: 12, reliability: 11, memories: 17 }),
        milestone: true, meetDay: day, socialMeeting: true, read: id }, meeting.kind, id, day, 'attend');
      const calendar = finishOuting(state.calendar);
      if (meeting.kind === 'cinema' && outingAvailable(period)) {
        return { ...state, phone: next, calendar, cityVisit: true,
          base: updateStage5(base, { room: null }, paid.bank, paid.status),
          paidVisit: { open: true, record: { venue: 'cinema', together: true, viaPhone: true, day, outing: period,
            revision: id, spent: game.bank - paid.bank, statusGain: paid.status - game.status } } };
      }
      return { ...state, phone: next, calendar, base: updateStage5(base, {}, paid.bank, paid.status + award) };
    }
    case 'apologize': {
      if (!phone.conflict) return state;
      const { conflict: _resolved, ...rest } = phone;
      next = addMessage({ ...change(rest, { trust: 5, reliability: 5 }), read: id }, 'reconcile', id, day, 'apologize');
      break;
    }
    case 'friendship':
    case 'mutual':
    case 'commit':
      if (!(command.choice === 'friendship' ? view.canFriendship : command.choice === 'mutual' ? view.canMutual : view.canCommit)) return state;
      next = { ...phone, consent: command.choice === 'commit' ? 'close' : command.choice === 'mutual' ? 'mutual' : 'friends' };
      break;
    case 'introduce':
      if (!view.canIntroduce) return state;
      next = { ...phone, contact: true };
      break;
    case 'sell': {
      const { order, ...rest } = phone;
      if (!order || command.target !== order.id || day > order.due) return state;
      const item = suitableItem(state, order.itemId);
      if (!item || !Number.isSafeInteger(game.bank + order.price)) return state;
      return { ...state, phone: rest, base: settleSales(base, [{ item, price: order.price }], state.flea.items) };
    }
  }
  return { ...state, phone: next, base: updateStage5(base, {}) };
}

export function maintainPhone(before: Stage7State, next: Stage7State, command: { type: string }): Stage7State {
  if (before === next) return next;
  const known = next.base.base.relationshipStep !== 'unmet';
  if (!known && !next.phone) return next;
  const original = next.phone ?? phoneFor(before);
  let phone = original;
  const { day } = next.calendar;
  const id = next.base.base.game.revision;
  // Legacy narrative choices still contribute once through the same visible relationship score.
  if (before.life !== next.life && next.life) {
    const previous = before.life ?? initialLife(before.base.base.relationshipStep);
    const effect: Partial<Scores> = {};
    for (const key of lifeStats) effect[key] = (next.life[key] - previous[key]) * 8;
    if (previous.broken === next.life.broken || !next.life.broken) phone = change(phone, effect);
    else phone = penalize(phone, day);
  }
  const joined = known && before.base.base.relationshipStep === 'unmet';
  const delivered = command.type === 'finishCargo' && next.base.items.length > before.base.items.length;
  const turntable = delivered && next.base.items.some(item => isTurntable(item) && !before.base.items.some(({ id }) => id === item.id));
  const topic = joined ? 'hello' : turntable ? 'turntable' : delivered ? 'find' : command.type === 'nextLot' ? 'auction'
    : command.type === 'buyHouse' ? 'house' : ['buyVehicle', 'buyPersonalCar', 'upgradeTransport'].includes(command.type) ? 'vehicle' : null;
  if (known && topic && (!phone.messages.some(message => message.topic === topic && message.day === day))) {
    phone = addMessage(phone, topic, id, day);
    if ((turntable || joined || delivered) && !phone.call && phone.callDay !== day) {
      phone = { ...phone, call: { id, due: null }, callDay: day };
    }
  }
  if (command.type === 'openReferral') phone = { ...phone, contact: true, orderWeek: weekOf(day) };
  if (phoneAvailable(next)) {
    if (phone.call?.due === null) phone = { ...phone, call: { ...phone.call, due: Math.min(Number.MAX_SAFE_INTEGER, day + 1) } };
    else if (phone.call && day > phone.call.due) {
      const { call, ...rest } = phone;
      phone = call.promised ? penalize(rest, day) : rest;
    }
    if (phone.meeting && day > phone.meeting.day) {
      const { meeting: _missed, ...rest } = phone;
      phone = penalize(rest, day);
    }
    if (phone.order && (day > phone.order.due || !suitableItem(next, phone.order.itemId))) {
      const { order: _closed, ...rest } = phone;
      phone = rest;
    }
    if (phone.contact && !phone.order && phone.orderWeek !== weekOf(day)) {
      const item = suitableItem(next);
      if (item) phone = { ...phone, orderWeek: weekOf(day), order: { id, itemId: item.id, itemName: item.name,
        price: Math.round(item.value * 1.15), due: Math.min(Number.MAX_SAFE_INTEGER, day + 3) } };
    }
  }
  return original === phone && !before.phone && !joined && !next.phone ? next : { ...next, phone };
}
