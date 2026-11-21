import type { Stage3Command, Stage3View } from './stage3-contract';

export type RelationshipStep = 'unmet' | 'met' | 'flowersGiven' | 'cinemaVisited' | 'dinnerVisited' | 'movedIn';

export type RelationshipGoalAction = 'meetNeighbor' | 'buyFlowers' | 'inviteToCinema' | 'inviteToDinner' | 'confirmMoveIn';

export interface RelationshipGoal {
  readonly action: RelationshipGoalAction;
  readonly price: number | null;
  readonly requiredStatus: number | null;
  readonly missingUpgrades: readonly ('home' | 'car')[];
  readonly canProceed: boolean;
}

interface RelationshipProgress {
  // The last completed step persists when the player returns to the hub.
  readonly step: RelationshipStep;
  readonly nextGoal: RelationshipGoal | null;
}

type RelationshipAction = RelationshipGoalAction | 'openRelationship';

export type Stage4Command = Stage3Command | {
  [Action in RelationshipAction]: { readonly type: Action; readonly expectedRevision: number };
}[RelationshipAction];

export type Stage4Dispatch = (command: Stage4Command) => void;
export type Stage4Mount = (root: HTMLElement, view: Stage4View, dispatch: Stage4Dispatch) => void;

type Stage3HubView = Extract<Stage3View, { phase: 'hub' }>;

export type Stage4HubView = Omit<Stage3HubView, 'allowedActions'> & {
  readonly relationship: RelationshipProgress;
  // The hub allows opening the story from status 8, including after the epilogue.
  readonly allowedActions: readonly (Stage3HubView['allowedActions'][number] | 'openRelationship')[];
};

export type RelationshipView = RelationshipProgress & {
  readonly phase: 'relationship';
  readonly revision: number;
  readonly bank: number;
  readonly status: number;
  // Render the scene for `step`. The `movedIn` scene is the epilogue. Use the
  // hub's ordinary auction action to resume bidding after returning from it.
  readonly allowedActions: readonly (RelationshipGoalAction | 'returnToHub')[];
};

export type Stage4View = Exclude<Stage3View, Stage3HubView> | Stage4HubView | RelationshipView;
