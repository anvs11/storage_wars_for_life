export const periods = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Period = typeof periods[number];

export interface CalendarState {
  readonly day: number;
  readonly period: Period;
}

const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'] as const;
type Weekday = typeof weekdays[number];

export interface CalendarView extends CalendarState {
  readonly weekday: Weekday;
  readonly outing: 'утренний выезд' | 'дневной выезд' | null;
  readonly remainingOutings: 0 | 1 | 2;
  readonly nextMarket: { readonly weekday: 'Суббота' | 'Воскресенье'; readonly daysAway: number };
}

export function outingAvailable(period: Period): boolean {
  return period === 'morning' || period === 'afternoon';
}

export function finishOuting(calendar: CalendarState): CalendarState {
  return { ...calendar, period: calendar.period === 'morning' ? 'afternoon' : 'evening' };
}

export function getCalendarView(calendar: CalendarState): CalendarView {
  const { day, period } = calendar;
  const weekdayIndex = (day - 1) % weekdays.length;
  const morning = period === 'morning';
  const afternoon = period === 'afternoon';
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
    outing: morning ? 'утренний выезд' : afternoon ? 'дневной выезд' : null,
    remainingOutings: morning ? 2 : afternoon ? 1 : 0,
  };
}
