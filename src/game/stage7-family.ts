export const familyOccasion = 'День рождения соседки';

export interface FamilyDate {
  readonly day: number;
  readonly outcome: 'pending' | 'celebrated' | 'missed';
}

export function scheduleFamilyDate(day: number): FamilyDate | null {
  const earliest = day + 2;
  const sunday = earliest + (7 - earliest % 7) % 7;
  return Number.isSafeInteger(sunday) ? { day: sunday, outcome: 'pending' } : null;
}

export function familyDateAtWake(date: FamilyDate | null, day: number): FamilyDate | null {
  return date?.outcome === 'pending' && day > date.day ? { ...date, outcome: 'missed' } : date;
}

export function pendingFamilyDateOn(date: FamilyDate | null, day: number): FamilyDate | null {
  return date?.outcome === 'pending' && date.day === day ? date : null;
}
