export const outingPeriods = ['morning', 'afternoon', 'lateAfternoon'] as const;
export type OutingPeriod = typeof outingPeriods[number];
export const periods = [...outingPeriods, 'evening', 'night'] as const;
export type Period = typeof periods[number];
export const periodNames: Record<Period, string> = {
  morning: 'утро', afternoon: 'день', lateAfternoon: 'после полудня', evening: 'вечер', night: 'ночь',
};
export const waitLabels: Record<OutingPeriod, string> = {
  morning: 'до дня', afternoon: 'до второй половины дня', lateAfternoon: 'до вечера',
};
export const outingNames: Record<OutingPeriod, string> = {
  morning: 'утренний выезд', afternoon: 'дневной выезд', lateAfternoon: 'последний выезд',
};

export interface CalendarState {
  readonly day: number;
  readonly period: Period;
}

const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'] as const;
type Weekday = typeof weekdays[number];

export interface CalendarView extends CalendarState {
  readonly weekday: Weekday;
  readonly outing: string | null;
  readonly remainingOutings: number;
  readonly nextMarket: { readonly weekday: 'Суббота' | 'Воскресенье'; readonly daysAway: number };
}

export function outingAvailable(period: Period): period is OutingPeriod {
  return period !== 'evening' && period !== 'night';
}

export function periodAfterOuting(period: OutingPeriod): Period {
  return periods[periods.indexOf(period) + 1]!;
}

export function finishOuting(calendar: CalendarState): CalendarState {
  const { period } = calendar;
  return outingAvailable(period) ? { ...calendar, period: periodAfterOuting(period) } : calendar;
}

export function getCalendarView(calendar: CalendarState): CalendarView {
  const { day, period } = calendar;
  const weekdayIndex = (day - 1) % weekdays.length;
  const morning = period === 'morning';
  let nextMarket: CalendarView['nextMarket'];
  if (weekdayIndex < 5 || (weekdayIndex === 5 && morning)) {
    nextMarket = { weekday: 'Суббота', daysAway: 5 - weekdayIndex };
  } else if (weekdayIndex === 5 || morning) {
    nextMarket = { weekday: 'Воскресенье', daysAway: 6 - weekdayIndex };
  } else {
    nextMarket = { weekday: 'Суббота', daysAway: 6 };
  }
  return {
    ...calendar, weekday: weekdays[weekdayIndex]!, nextMarket,
    outing: outingAvailable(period) ? outingNames[period] : null,
    remainingOutings: Math.max(0, outingPeriods.length - periods.indexOf(period)),
  };
}
