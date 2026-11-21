import type { AuctionTier, Stage3Command } from './stage3-contract';
import { applyCommand, getView, newGame } from './stage3-engine';
import type { Stage3State } from './stage3-engine';

export type Action = {
  [Kind in Stage3Command['type']]: Omit<Extract<Stage3Command, { type: Kind }>, 'expectedRevision'>;
}[Stage3Command['type']];

export function act(state: Stage3State, action: Action): Stage3State {
  return applyCommand(state, { ...action, expectedRevision: state.revision });
}

export function accepted(state: Stage3State, action: Action): Stage3State {
  const next = act(state, action);
  if (next === state) throw new Error(`Команда ${action.type} отклонена в фазе ${state.phase}`);
  return next;
}

export function tutorial(seed: number): Stage3State {
  return accepted(newGame(seed), { type: 'skipStory' });
}

export function hub(seed: number): Extract<Stage3State, { phase: 'hub' }> {
  const passed = accepted(tutorial(seed), { type: 'pass' });
  const state = accepted(passed, { type: 'nextLot' });
  if (state.phase !== 'hub') throw new Error('Ожидается экран выбора торгов');
  return state;
}

export function enter(state: Stage3State, tier: AuctionTier): Stage3State {
  return accepted(state, { type: 'enterAuction', tier });
}

export function inspectAll(state: Stage3State): Stage3State {
  const view = getView(state);
  if (view.phase !== 'inspection') throw new Error('Ожидается осмотр лота');
  for (const item of view.visibleItems) {
    if (item.canInspect) state = accepted(state, { type: 'inspect', itemId: item.id });
  }
  return state;
}

export function finishAuction(state: Stage3State, limit: number): Stage3State {
  for (let view = getView(state); view.phase === 'inspection' || view.phase === 'bidding'; view = getView(state)) {
    const action = view.allowedActions.includes('bid') && view.nextBidAmount <= limit ? 'bid' : 'pass';
    state = accepted(state, { type: action });
  }
  const view = getView(state);
  if (view.phase === 'result') return state;
  if (view.phase !== 'reveal') throw new Error('Ожидается результат торгов');
  for (const box of view.sealedBoxes) state = accepted(state, { type: 'openBox', boxId: box.id });
  return accepted(state, { type: 'sellAll' });
}
