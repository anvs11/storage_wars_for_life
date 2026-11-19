import type { Dispatch } from './game/contract';
import { applyCommand, getView, newGame } from './game/engine';
import { mount } from './ui/mount';

const root = document.getElementById('app');

if (root) {
  let state = newGame();
  const dispatch: Dispatch = (command) => {
    const nextState = applyCommand(state, command);
    if (nextState === state) return;
    state = nextState;
    mount(root, getView(state), dispatch);
  };

  mount(root, getView(state), dispatch);
}
