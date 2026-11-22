import { advanceRelationship, canOpenRelationship, getRelationshipGoal } from './relationships';
import { applyCommand as applyBaseCommand, getView as getBaseView, legacyEconomy, newGame as newBaseGame } from './stage3-engine';
import type { Stage3HubState, Stage3State } from './stage3-engine';
import type { RelationshipStep, Stage4Command, Stage4View } from './stage4-contract';

export type Stage4State = { readonly relationshipStep: RelationshipStep } & (
  | { readonly game: Stage3State; readonly relationshipOpen: false }
  | { readonly game: Stage3HubState; readonly relationshipOpen: true }
);

export function migrateStage3(game: Stage3State): Stage4State {
  return { game, relationshipStep: 'unmet', relationshipOpen: false };
}

export function newGame(seed?: number): Stage4State {
  return migrateStage3(newBaseGame(seed));
}

export function applyCommand(state: Stage4State, command: Stage4Command, economy = legacyEconomy): Stage4State {
  const { game, relationshipStep } = state;
  if (command.expectedRevision !== game.revision) return state;

  if (state.relationshipOpen) {
    if (command.type === 'returnToHub') {
      return { ...state, game: { ...game, revision: game.revision + 1 }, relationshipOpen: false };
    }
    const advanced = advanceRelationship(state.game, relationshipStep, command.type, economy);
    return advanced ? { ...advanced, relationshipOpen: true } : state;
  }

  switch (command.type) {
    case 'openRelationship':
      if (game.phase !== 'hub' || !canOpenRelationship(game.status)) return state;
      return { ...state, game: { ...game, revision: game.revision + 1 }, relationshipOpen: true };
    case 'meetNeighbor':
    case 'buyFlowers':
    case 'inviteToCinema':
    case 'inviteToDinner':
    case 'confirmMoveIn':
      return state;
    default: {
      const next = applyBaseCommand(game, command, economy);
      return next === game ? state : { ...state, game: next };
    }
  }
}

export function getView(state: Stage4State, economy = legacyEconomy): Stage4View {
  const { game, relationshipStep: step } = state;
  if (state.relationshipOpen) {
    const { bank, revision, status } = game;
    const nextGoal = getRelationshipGoal(game, step, economy);
    return {
      phase: 'relationship', bank, revision, status, step, nextGoal,
      allowedActions: nextGoal?.canProceed ? [nextGoal.action, 'returnToHub'] : ['returnToHub'],
    };
  }

  const view = getBaseView(game, economy);
  if (view.phase !== 'hub') return view;
  return {
    ...view,
    relationship: { step, nextGoal: getRelationshipGoal(game, step, economy) },
    allowedActions: canOpenRelationship(game.status) ? [...view.allowedActions, 'openRelationship'] : view.allowedActions,
  };
}
