import type { Dispatch, GameView } from '../game/contract';
import {
  inspectedView,
  inspectionView,
  opponentBidView,
  passedResultView,
  revealView,
  soldResultView,
} from '../game/exampleViews';
import { mount } from './mount';

// Временный просмотр согласованных представлений до подключения движка в src/main.ts.
const container = document.querySelector<HTMLElement>('#app');
if (!container) throw new Error('Не найден контейнер экрана');
const root: HTMLElement = container;

const options = new URLSearchParams(location.search);
let view: GameView = inspectionView;
let inspected = false;
let bankOffset = 0;

const dispatch: Dispatch = (command) => {
  if (command.expectedRevision !== view.revision) return;
  const allowedActions: readonly string[] = view.allowedActions;
  if (!allowedActions.includes(command.type)) return;

  switch (command.type) {
    case 'inspect':
      if (command.itemId !== 'bicycle') return;
      inspected = true;
      show(view.phase === 'bidding' ? opponentBidView : inspectedView);
      break;
    case 'bid':
      if (view.phase === 'inspection') {
        show(inspected ? opponentBidView : {
          ...opponentBidView,
          visibleItems: inspectionView.visibleItems,
          allowedActions: ['inspect', ...opponentBidView.allowedActions],
        });
      } else if (view.phase === 'bidding') {
        show(revealView);
      }
      break;
    case 'pass':
      show(passedResultView);
      break;
    case 'sellAll':
      show(soldResultView);
      break;
    case 'nextLot':
      inspected = false;
      bankOffset = view.bank - inspectionView.bank;
      show(inspectionView);
      break;
  }

  document.dispatchEvent(new CustomEvent('garage-preview-command', { detail: command }));
};

function render(): void {
  const displayedView = options.has('long-labels') ? {
    ...view,
    visibleItems: view.visibleItems.map((item) => ({
      ...item,
      name: `${item.name} из дальнего угла гаража под металлической полкой`,
    })),
  } : view;
  mount(root, displayedView, dispatch);
}

function show(next: GameView): void {
  view = { ...next, bank: next.bank + bankOffset, revision: view.revision + 1 };
  render();
}

render();
