import type { Stage3Command, Stage3Dispatch, Stage3View } from '../game/stage3-contract';
import { actionButton, addFact, bankFor, dollars, element, replaceScreen } from './dom';
import { inventoryFor, receiptFacts, saleFacts } from './inventory';

type BaggageView = Extract<Stage3View, { phase: 'airportOffer' | 'baggageInventory' | 'baggageResult' }>;
const primary = 'garage__button garage__button--primary';

export function mountBaggage(root: HTMLElement, view: BaggageView, dispatch: Stage3Dispatch): void {
  const screen = element('section', 'garage');
  const header = element('header', 'garage__header');
  const titles = {
    airportOffer: 'Предложение аэропорта',
    baggageInventory: 'Багаж',
    baggageResult: 'Квитанция за багаж',
  };
  const title = element('h1', 'garage__title', titles[view.phase]);
  title.tabIndex = -1;
  header.append(title, bankFor(view.bank));

  const panel = element('section', 'garage__panel garage__panel--recovery');
  const allowed = new Set(view.allowedActions);
  const controls = element('div', 'garage__controls');
  const revision = view.revision;

  function button(label: string, command: Stage3Command, key: string, className: string): HTMLButtonElement {
    const control = actionButton(label, className, () => dispatch(command));
    control.dataset.screenFocus = key;
    return control;
  }

  switch (view.phase) {
    case 'airportOffer': {
      const facts = element('dl', 'garage__facts');
      addFact(facts, 'Цена закрытого чемодана', dollars(view.price));
      panel.append(facts);
      if (!view.canAfford) {
        panel.append(element('p', 'garage__prompt', 'В банке недостаточно денег для покупки чемодана.'));
      }
      if (view.canAfford && allowed.has('buyBaggage')) {
        controls.append(button(`Купить за ${dollars(view.price)}`, { type: 'buyBaggage', expectedRevision: revision },
          'buy', primary));
      }
      break;
    }
    case 'baggageInventory':
      if (view.revealedFinds.length || view.revenue > 0) panel.append(saleFacts(view));
      panel.append(inventoryFor(view, button));
      if (allowed.has('sellAll')) {
        controls.append(button('Продать остаток', { type: 'sellAll', expectedRevision: revision }, 'sellAll', primary));
      }
      break;
    case 'baggageResult':
      panel.append(receiptFacts(view.receipt, view.bank));
      break;
  }
  if (allowed.has('returnToHub')) {
    controls.append(button('К выбору торгов', { type: 'returnToHub', expectedRevision: revision }, 'return',
      view.phase !== 'airportOffer' || !view.canAfford ? primary : 'garage__button'));
  }
  panel.append(controls);
  screen.append(header, panel);
  replaceScreen(root, screen, title);
}
