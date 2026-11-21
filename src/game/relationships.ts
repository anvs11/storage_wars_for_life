import { offers } from './progression';
import type { Asset } from './progression';
import { applySpending } from './stage3-engine';
import type { Stage3HubState } from './stage3-engine';
import type { RelationshipGoal, RelationshipGoalAction, RelationshipStep, Stage4Command } from './stage4-contract';

const meetingStatus = 8;
const cinemaStatus = 12;
const dinnerStatus = offers.restaurant.requiredStatus;
const moveInUpgrades = ['home', 'car'] as const;

type RelationshipProfile = Pick<Stage3HubState, 'bank' | 'status' | 'assets'>;

interface RelationshipEvent {
  readonly action: RelationshipGoalAction;
  readonly nextStep: RelationshipStep;
  readonly requiredStatus?: number;
  readonly payment?: number | 'cinema' | 'restaurant';
  readonly requiredUpgrades?: readonly Asset[];
}

const events: Readonly<Record<RelationshipStep, RelationshipEvent | null>> = {
  unmet: { action: 'meetNeighbor', nextStep: 'met', requiredStatus: meetingStatus },
  met: { action: 'buyFlowers', nextStep: 'flowersGiven', payment: 8 },
  flowersGiven: { action: 'inviteToCinema', nextStep: 'cinemaVisited', requiredStatus: cinemaStatus, payment: 'cinema' },
  cinemaVisited: { action: 'inviteToDinner', nextStep: 'dinnerVisited', requiredStatus: dinnerStatus, payment: 'restaurant' },
  dinnerVisited: { action: 'confirmMoveIn', nextStep: 'movedIn', requiredUpgrades: moveInUpgrades },
  movedIn: null,
};

export function canOpenRelationship(status: number): boolean {
  return status >= meetingStatus;
}

function goalForEvent(game: RelationshipProfile, event: RelationshipEvent): RelationshipGoal {
  const { action, payment, requiredStatus = null, requiredUpgrades = [] } = event;
  const price = typeof payment === 'string' ? offers[payment].price : payment ?? null;
  const missingUpgrades = requiredUpgrades.filter((asset) => !game.assets.includes(asset));
  const canProceed = game.bank >= (price ?? 0) && game.status >= (requiredStatus ?? 0) && missingUpgrades.length === 0;
  return { action, price, requiredStatus, missingUpgrades, canProceed };
}

export function getRelationshipGoal(game: RelationshipProfile, step: RelationshipStep): RelationshipGoal | null {
  const event = events[step];
  return event ? goalForEvent(game, event) : null;
}

export function advanceRelationship(game: Stage3HubState, step: RelationshipStep, action: Stage4Command['type']) {
  const event = events[step];
  if (!event || event.action !== action || !goalForEvent(game, event).canProceed) return null;
  const { payment, nextStep } = event;
  const next = typeof payment === 'string' ? applySpending(game, payment)
    : { ...game, bank: game.bank - (payment ?? 0), revision: game.revision + 1 };
  return next === game ? null : { game: next, relationshipStep: nextStep };
}

const minimumStatus: Readonly<Record<RelationshipStep, number>> = {
  unmet: 0,
  met: meetingStatus,
  flowersGiven: meetingStatus,
  cinemaVisited: cinemaStatus + offers.cinema.statusGain,
  dinnerVisited: dinnerStatus + offers.restaurant.statusGain,
  movedIn: dinnerStatus + offers.restaurant.statusGain,
};

export function isRelationshipStep(value: unknown, status: number, assets: readonly Asset[]): value is RelationshipStep {
  if (typeof value !== 'string' || !Object.hasOwn(minimumStatus, value)) return false;
  const step = value as RelationshipStep;
  return status >= minimumStatus[step] && (step !== 'movedIn' || moveInUpgrades.every((asset) => assets.includes(asset)));
}
