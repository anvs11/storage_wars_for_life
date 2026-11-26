import { offers } from './progression';
import type { OfferId } from './stage3-contract';
import type { Stage5Command } from './stage5-contract';
import type { OutingPeriod } from './stage7-calendar';

export type VisitVenue = Exclude<OfferId, 'home' | 'car'>;

export interface VisitRecord {
  readonly venue: VisitVenue;
  readonly together: boolean;
  readonly day: number;
  readonly outing: OutingPeriod;
  readonly spent: number;
  readonly statusGain: number;
  readonly revision: number;
}

export interface VisitPhoto {
  readonly record: VisitRecord;
  readonly open: boolean;
}

export function isVenue(offer: unknown): offer is VisitVenue {
  return typeof offer === 'string' && Object.hasOwn(offers, offer) && offer !== 'home' && offer !== 'car';
}

export function isCityVisit(venue: VisitVenue | undefined): boolean {
  return venue === 'cinema' || venue === 'restaurant' || venue === 'theater';
}

export function relationshipVenue(action: Stage5Command['type']): 'cinema' | 'restaurant' | null {
  if (action === 'inviteToCinema') return 'cinema';
  return action === 'inviteToDinner' ? 'restaurant' : null;
}

export function visitActivity(command: Stage5Command): Pick<VisitRecord, 'venue' | 'together'> | null {
  const together = relationshipVenue(command.type);
  if (together) return { venue: together, together: true };
  return command.type === 'spend' && isVenue(command.offerId) ? { venue: command.offerId, together: false } : null;
}
