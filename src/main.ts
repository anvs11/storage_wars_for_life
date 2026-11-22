import type { Stage5Dispatch } from './game/stage5-contract';
import { getView, newGame } from './game/stage5-engine';
import type { Stage5State } from './game/stage5-engine';
import type { SaveStorage } from './platform/save';
import { applySavedCommand, load, save } from './platform/stage5-save';
import { mountStage5 } from './ui/mount';

function start(root: HTMLElement): void {
  const storage: SaveStorage = {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
  const feedback = document.createElement('div');
  feedback.style.cssText = 'background: #fff; color: #111; font: 1rem system-ui, sans-serif;';
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  const action = document.createElement('button');
  action.type = 'button';
  action.hidden = true;
  action.style.margin = '0 1rem 0.75rem';
  feedback.append(status, action);
  root.before(feedback);

  let state: Stage5State | undefined;

  function notify(message: string, nextAction?: { label: string; run: () => void }): void {
    status.textContent = message;
    status.style.padding = message ? '0.75rem 1rem' : '';
    action.hidden = !nextAction;
    action.textContent = nextAction?.label ?? '';
    action.onclick = nextAction?.run ?? null;
  }

  const dispatch: Stage5Dispatch = (command) => {
    if (!state) return;
    const result = applySavedCommand(storage, state, command);
    if (result.kind === 'ignored') return;
    if (result.kind === 'failed') {
      notify(result.message);
      return;
    }
    show(result.state);
  };

  function show(nextState: Stage5State, message = ''): void {
    state = nextState;
    notify(message);
    mountStage5(root, getView(state), dispatch);
  }

  function startNew(): void {
    const fresh = newGame();
    const result = save(storage, fresh);
    if (result.ok) {
      show(fresh);
    } else {
      notify(result.message, { label: 'Начать новую игру', run: startNew });
    }
  }

  function resume(): void {
    const result = load(storage);
    switch (result.kind) {
      case 'loaded':
        show(result.state);
        break;
      case 'recovered':
        show(result.state, result.message);
        break;
      case 'new':
        show(newGame());
        break;
      case 'damaged':
        notify(result.message, { label: 'Начать новую игру', run: startNew });
        break;
      case 'unavailable':
        notify(result.message, { label: 'Повторить загрузку', run: resume });
        break;
    }
  }

  resume();
}

const root = document.getElementById('app');
if (root) start(root);
