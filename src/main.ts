import { getView, newGame } from './game/stage7-engine';
import type { Stage7Dispatch, Stage7State } from './game/stage7-engine';
import type { SaveStorage } from './platform/save';
import { applySavedCommand, load, resetSave } from './platform/stage7-save';
import { preloadAds, showFullscreenAd, showRewardedVideo } from './platform/yandex-ads';
import { actionButton, element } from './ui/dom';
import { mountStage7 } from './ui/stage7';
import { mountFirstSteps } from './ui/first-steps';

const tipsPreference = 'storage-wars.hide-tips';

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

  let state: Stage7State | undefined;
  let watching = false;
  let nightAdPending = false;
  let tipsHidden = false;
  try {
    tipsHidden = storage.getItem(tipsPreference) === '1';
  } catch {
    // Keep tips available when browser storage is blocked.
  }

  function notify(message: string, nextAction?: { label: string; run: () => void }): void {
    status.textContent = message;
    status.style.padding = message ? '0.75rem 1rem' : '';
    action.hidden = !nextAction;
    action.textContent = nextAction?.label ?? '';
    action.onclick = nextAction?.run ?? null;
  }

  const dispatch: Stage7Dispatch = (command) => {
    if (!state || nightAdPending) return;
    const result = applySavedCommand(storage, state, command);
    if (result.kind === 'ignored') return;
    if (result.kind === 'failed') {
      notify(result.message, { label: 'Повторить действие', run: () => dispatch(command) });
      return;
    }
    const visit = result.state.paidVisit?.record;
    show(result.state, '', visit !== undefined && visit !== state.paidVisit?.record);
    if (command.type === 'sleep') {
      const returnFocus = root.contains(document.activeElement);
      nightAdPending = true;
      root.inert = true;
      void showFullscreenAd().finally(() => {
        nightAdPending = false;
        root.inert = false;
        if (returnFocus) root.querySelector<HTMLButtonElement>('[data-screen-focus="wake-up"]')?.focus();
      });
    }
  };

  function show(nextState: Stage7State, message = '', animateVisit = false): void {
    state = nextState;
    notify(message);
    const view = getView(state);
    mountStage7(root, view, dispatch, animateVisit, async (revision) => {
      if (watching) return;
      watching = true;
      const before = state;
      const result = await showRewardedVideo();
      watching = false;
      if (state !== before) return;
      if (result === 'rewarded') dispatch({ type: 'authorizeJob', expectedRevision: revision });
      else notify(result === 'closed' ? 'Видео закрыто. Заказ откроется после завершённого просмотра.'
        : 'Видео сейчас недоступно. Можно вернуться домой и продать вещи.');
    });
    if (nextState.base.opening !== null) return;
    const menu = element('details', 'game-menu');
    const tipsToggle = actionButton('', 'garage__button', () => setTips(!tipsHidden, true));
    function setTips(hidden: boolean, focusMenu = false): void {
      tipsHidden = hidden;
      try { storage.setItem(tipsPreference, hidden ? '1' : '0'); } catch { /* Session preference still applies. */ }
      root.querySelector('.first-step')?.remove();
      root.querySelector('.first-step-target')?.classList.remove('first-step-target');
      renderTips();
      if (focusMenu) {
        menu.open = false;
        menu.querySelector('summary')?.focus({ preventScroll: true });
      }
    }
    function renderTips(): void {
      tipsToggle.textContent = tipsHidden ? 'Показать обучение' : 'Скрыть обучение';
      if (!tipsHidden) mountFirstSteps(root, nextState, view, () => setTips(true, true));
    }
    const menuActions = element('div', 'game-menu__actions');
    menuActions.append(actionButton('Начать заново', 'garage__button', () => {
      if (window.confirm('Начать новую игру? Текущая партия будет удалена.')) startNew();
    }), tipsToggle);
    menu.append(element('summary', '', 'Меню'), menuActions);
    root.querySelector('.garage__header')?.append(menu);
    renderTips();
  }

  function startNew(): void {
    const fresh = newGame();
    const result = resetSave(storage, fresh);
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

  preloadAds();
  resume();
}

const root = document.getElementById('app');
if (root) start(root);
