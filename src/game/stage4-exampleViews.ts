import { auctions, offerIds, offers, tiers } from './progression';
import type { Asset } from './progression';
import type { RelationshipGoal, Stage4HubView, Stage4View } from './stage4-contract';

const meet = {
  action: 'meetNeighbor', price: null, requiredStatus: 8, missingUpgrades: [], canProceed: true,
} as const satisfies RelationshipGoal;

const flowers = {
  action: 'buyFlowers', price: 8, requiredStatus: null, missingUpgrades: [], canProceed: true,
} as const satisfies RelationshipGoal;

const cinema = {
  action: 'inviteToCinema', price: 10, requiredStatus: 12, missingUpgrades: [], canProceed: true,
} as const satisfies RelationshipGoal;

const dinner = {
  action: 'inviteToDinner', price: 25, requiredStatus: 18, missingUpgrades: [], canProceed: true,
} as const satisfies RelationshipGoal;

const moveIn = {
  action: 'confirmMoveIn', price: null, requiredStatus: null, missingUpgrades: [], canProceed: true,
} as const satisfies RelationshipGoal;

function exampleHub(
  revision: number,
  bank: number,
  status: number,
  relationship: Stage4HubView['relationship'],
  ownedUpgrades: readonly Asset[] = [],
): Stage4HubView {
  const nextTier = tiers.find((tier) => auctions[tier].requiredStatus > status);
  return {
    phase: 'hub', revision, bank, status, relationship,
    nextUnlock: nextTier ? { title: auctions[nextTier].title, requiredStatus: auctions[nextTier].requiredStatus } : null,
    auctions: tiers.map((tier) => ({
      tier,
      ...auctions[tier],
      availability: status < auctions[tier].requiredStatus ? 'statusLocked' : 'ready',
    })),
    offers: offerIds.map((id) => ({
      id,
      ...offers[id],
      availability: (id === 'home' || id === 'car') && ownedUpgrades.includes(id) ? 'owned'
        : status < offers[id].requiredStatus ? 'statusLocked'
        : bank < offers[id].price ? 'fundsLocked'
        : 'ready',
    })),
    baggagePrice: 25,
    allowedActions: status < 8 ? ['enterAuction', 'spend', 'callAirport']
      : ['enterAuction', 'spend', 'callAirport', 'openRelationship'],
  };
}

// Hand-authored screen fixtures for UI work. They do not execute game commands.
export const stage4Views = {
  hubBeforeMeeting: exampleHub(30, 115, 7, { step: 'unmet', nextGoal: { ...meet, canProceed: false } }),
  hubMeetingUnlocked: exampleHub(31, 110, 8, { step: 'unmet', nextGoal: meet }),
  meeting: {
    phase: 'relationship', revision: 32, bank: 110, status: 8,
    step: 'unmet', nextGoal: meet, allowedActions: ['meetNeighbor', 'returnToHub'],
  },
  flowersReady: {
    phase: 'relationship', revision: 33, bank: 110, status: 8,
    step: 'met', nextGoal: flowers, allowedActions: ['buyFlowers', 'returnToHub'],
  },
  flowersUnaffordable: {
    phase: 'relationship', revision: 39, bank: 7, status: 8,
    step: 'met', nextGoal: { ...flowers, canProceed: false }, allowedActions: ['returnToHub'],
  },
  cinemaWaiting: {
    phase: 'relationship', revision: 45, bank: 102, status: 11,
    step: 'flowersGiven', nextGoal: { ...cinema, canProceed: false }, allowedActions: ['returnToHub'],
  },
  cinemaReady: {
    phase: 'relationship', revision: 49, bank: 97, status: 12,
    step: 'flowersGiven', nextGoal: cinema, allowedActions: ['inviteToCinema', 'returnToHub'],
  },
  dinnerWaiting: {
    phase: 'relationship', revision: 55, bank: 73, status: 17,
    step: 'cinemaVisited', nextGoal: { ...dinner, canProceed: false }, allowedActions: ['returnToHub'],
  },
  dinnerReady: {
    phase: 'relationship', revision: 59, bank: 68, status: 18,
    step: 'cinemaVisited', nextGoal: dinner, allowedActions: ['inviteToDinner', 'returnToHub'],
  },
  moveInNeedsCar: {
    phase: 'relationship', revision: 100, bank: 200, status: 31,
    step: 'dinnerVisited', nextGoal: { ...moveIn, missingUpgrades: ['car'], canProceed: false },
    allowedActions: ['returnToHub'],
  },
  moveInOffer: {
    phase: 'relationship', revision: 104, bank: 100, status: 36,
    step: 'dinnerVisited', nextGoal: moveIn, allowedActions: ['confirmMoveIn', 'returnToHub'],
  },
  epilogue: {
    phase: 'relationship', revision: 105, bank: 100, status: 36,
    step: 'movedIn', nextGoal: null, allowedActions: ['returnToHub'],
  },
  hubAfterEpilogue: exampleHub(106, 100, 36, { step: 'movedIn', nextGoal: null }, ['home', 'car']),
} as const satisfies Record<string, Stage4View>;
