import { applyCommand, getView, newGame } from '../game/stage7-engine';
import type { Stage7Command } from '../game/stage7-engine';
import { mountStage7 } from './stage7';

// Standalone Vite playtest. Only the starting profile is prepared here.
let state = newGame(7);
const game = state.base.base.game;
if (game.phase !== 'hub') throw new Error('Для просмотра нужен стартовый профиль.');
state = {
  ...state,
  base: {
    ...state.base, opening: null, room: null,
    base: { ...state.base.base, game: {
      ...game, bank: 10000, lotNumber: 1, offerSeeds: { ...game.offerSeeds, ordinary: 7 },
    } },
  },
};
const root = document.getElementById('app')!;
function dispatch(command: Stage7Command): void {
  state = applyCommand(state, command);
  mountStage7(root, getView(state), dispatch);
}
dispatch({ type: 'enterAuction', tier: 'ordinary', expectedRevision: game.revision });
