import type { OwnedItem, Stage5State } from './stage5-engine';
import type { RelationshipStep } from './stage4-contract';

export const lifeEvents = ['intro', 'turntable', 'listening', 'request', 'gift', 'reconcile'] as const;
type EventId = typeof lifeEvents[number];
export const lifeChoices = ['talk', 'leave', 'repair', 'sell', 'keep', 'listen', 'reschedule', 'acceptRequest',
  'declineRequest', 'giveCamera', 'apologize', 'giveSpace', 'missed', 'soldPromise'] as const;
export type LifeChoice = typeof lifeChoices[number];
export type PromiseKind = 'listening' | 'camera';

export interface LifeState {
  readonly trust: number;
  readonly interest: number;
  readonly reliability: number;
  readonly memories: number;
  readonly seen: readonly EventId[];
  readonly last?: LifeChoice;
  readonly broken?: true;
  readonly promise?: { readonly kind: PromiseKind; readonly due: number; readonly itemId?: string };
  readonly recommendedWeek?: number;
  readonly displayId?: string;
}

export const lifeStats = ['trust', 'interest', 'reliability', 'memories'] as const;
export const lifeScore = (life: LifeState) => lifeStats.reduce((sum, stat) => sum + life[stat], 0);
export const weekOf = (day: number) => Math.floor((day - 1) / 7);
export const isTurntable = (item: OwnedItem) => /проигрыватель/i.test(item.name);
const isCamera = (item: OwnedItem) => /фотоаппарат/i.test(item.name);

export function initialLife(step: RelationshipStep): LifeState {
  const phase = ['unmet', 'met', 'flowersGiven', 'cinemaVisited', 'dinnerVisited', 'movedIn'].indexOf(step);
  return {
    trust: phase >= 3 ? 2 : 0, interest: phase > 0 ? 1 : 0, reliability: phase >= 4 ? 2 : 0,
    memories: Math.max(0, phase - 2), seen: phase > 0 ? ['intro'] : [],
  };
}

export function changeLife(life: LifeState, changes: Partial<Pick<LifeState, typeof lifeStats[number]>>): LifeState {
  const next = { ...life };
  for (const stat of lifeStats) next[stat] = Math.max(0, Math.min(5, life[stat] + (changes[stat] ?? 0)));
  return next;
}

export function breakPromise(life: LifeState, cause: 'missed' | 'soldPromise'): LifeState {
  const { promise: _promise, ...rest } = changeLife(life, { trust: -1, reliability: -1 });
  return { ...rest, last: cause, broken: true };
}

export const choiceLabels: Readonly<Record<LifeChoice, string>> = {
  talk: 'Рассказать о торгах', leave: 'Вежливо попрощаться',
  repair: 'Хочу сначала проверить и отремонтировать', sell: 'Продам, деньги сейчас важнее',
  keep: 'Оставлю, послушаем вместе', listen: 'Послушать пластинку вместе', reschedule: 'Договориться на завтра',
  acceptRequest: 'Пообещать поискать фотоаппарат', declineRequest: 'Сказать, что пока не возьмусь',
  giveCamera: 'Подарить исправный фотоаппарат', apologize: 'Извиниться и поговорить', giveSpace: 'Предложить поговорить позже',
  missed: 'Встреча или обещание пропущены', soldPromise: 'Обещанная вещь больше не в гараже',
};

const story: Record<EventId, { title: string; line: string }> = {
  intro: { title: 'Знакомство у крыльца', line: '«Ты ходишь на торги? Всегда хотела узнать, откуда берутся вещи на старых складах».' },
  turntable: { title: 'Находка с историей', line: '«Ты говорил, что нашёл старый проигрыватель. Что будешь с ним делать?»' },
  listening: { title: 'Вечер с пластинкой', line: '«Давай проверим, как он звучит. Мне принести пластинку?»' },
  request: { title: 'Подарок для отца', line: '«Если увидишь на торгах исправный плёночный фотоаппарат, дай знать. Папа будет рад».' },
  gift: { title: 'Фотоаппарат для отца', line: '«Нашёл рабочий? Папа уже придумал, что снимет первым».' },
  reconcile: { title: 'Разговор после пропущенной встречи', line: '«Я ждала. Давай договоримся, как предупреждать друг друга в следующий раз».' },
};

function scene(id: EventId, choices: readonly LifeChoice[], item?: OwnedItem) {
  return { id, ...story[id], choices, item };
}

export function lifeScene(life: LifeState, base: Stage5State, day: number, evening: boolean) {
  const { seen, promise } = life;
  if (!seen.includes('intro')) return scene('intro', ['talk', 'leave']);
  if (life.broken) return scene('reconcile', ['apologize', 'giveSpace']);
  if (promise?.kind === 'listening' && evening && day >= promise.due) {
    const item = base.items.find(({ id }) => id === promise.itemId);
    const choices: LifeChoice[] = item && item.condition !== 'damaged' ? ['listen'] : [];
    if (day < Number.MAX_SAFE_INTEGER) choices.push('reschedule');
    return scene('listening', choices, item);
  }
  if (promise?.kind === 'camera') {
    const camera = base.items.find(item => isCamera(item) && item.condition === 'good' &&
      !base.listings.some(listing => listing.itemId === item.id));
    return camera ? scene('gift', ['giveCamera'], camera) : null;
  }
  if (!seen.includes('turntable')) {
    const recordPlayer = base.items.find(isTurntable);
    if (recordPlayer) return scene('turntable', day < Number.MAX_SAFE_INTEGER ? ['repair', 'sell', 'keep'] : ['repair', 'sell'], recordPlayer);
  }
  if (!promise && seen.includes('turntable') && !seen.includes('request')) {
    return scene('request', day <= Number.MAX_SAFE_INTEGER - 3 ? ['acceptRequest', 'declineRequest'] : ['declineRequest']);
  }
  return null;
}

export function referralFor(life: LifeState, base: Stage5State, day: number) {
  if (life.broken || life.trust < 2 || life.memories < 1 || lifeScore(life) < 6 || life.recommendedWeek === weekOf(day)) return null;
  const item = base.items.find(item => item.condition === 'good' && (isCamera(item) || isTurntable(item)) &&
    item.id !== life.promise?.itemId && item.id !== life.displayId && !base.listings.some(listing => listing.itemId === item.id));
  if (!item) return null;
  const price = Math.round(item.value * 1.15);
  return Number.isSafeInteger(price) && price > 0 ? { item, price, day: Math.min(Number.MAX_SAFE_INTEGER, weekOf(day) * 7 + 7) } : null;
}
