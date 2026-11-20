import type { Stage2AuctionView, Stage2Command, Stage2Dispatch, Stage2Mount, Stage2View } from '../game/stage2-contract';
import type { Stage3AuctionView, Stage3Mount } from '../game/stage3-contract';
import { mountBaggage } from './baggage';
import { actionButton, addFact, bankFor, dollars, element } from './dom';
import { garageScenes } from './garage-scenes';
import { mountHub } from './hub';
import { inventoryFor, receiptFacts, saleFacts } from './inventory';
import { mountStory } from './story';
import './garage.css';
import './stage3.css';

type AuctionView = Stage2AuctionView | Stage3AuctionView;

function factsFor(view: AuctionView): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  switch (view.phase) {
    case 'inspection':
      addFact(facts, 'Стартовая ставка', dollars(view.nextBidAmount));
      break;
    case 'bidding':
      addFact(facts, 'Ваша ставка', dollars(view.lastPlayerBid));
      addFact(facts, view.leaderName, dollars(view.currentPrice));
      break;
    case 'reveal':
      return saleFacts(view);
    case 'result':
      return receiptFacts(view.receipt, view.bank);
  }
  return facts;
}

function mountAuction(root: HTMLElement, view: AuctionView, dispatch: Stage2Dispatch): void {
  const previousFocus = root.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = previousFocus?.getAttribute('data-garage-focus');
  const allowed = new Set(view.allowedActions);
  const buttons = new Map<string, HTMLButtonElement>();

  function button(label: string, command: Stage2Command, key: string, className: string): HTMLButtonElement {
    const control = actionButton(label, className, () => dispatch(command));
    control.dataset.garageFocus = key;
    buttons.set(key, control);
    return control;
  }

  const screen = element('section', 'garage');
  const artwork = garageScenes[view.sceneId];
  screen.setAttribute('aria-label', artwork.title);
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', artwork.title);
  title.tabIndex = -1;
  title.dataset.garageFocus = 'title';
  const titleGroup = element('div', '');
  titleGroup.append(element('p', 'garage__lot', `Лот №${view.lotNumber}`), title);
  header.append(titleGroup, bankFor(view.bank));

  const layout = element('div', 'garage__layout');
  const scene = element('div', 'garage__scene');
  const photo = element('img', 'garage__photo');
  photo.src = artwork.image;
  photo.alt = artwork.alt;
  const items = element('ul', 'garage__items');
  const hints = element('div', 'garage__hints');
  const inspected = new Map<string, HTMLElement>();
  const auctionOpen = view.phase === 'inspection' || view.phase === 'bidding';

  if (auctionOpen) {
    for (const item of view.visibleItems) {
      const row = element('li', 'garage__item');
      const key = `inspect:${item.id}`;
      if (item.canInspect && allowed.has('inspect')) {
        const inspectButton = button(
          item.name,
          { type: 'inspect', itemId: item.id, expectedRevision: view.revision },
          key,
          'garage__button garage__button--inspect',
        );
        inspectButton.setAttribute('aria-label', `Осмотреть предмет: ${item.name}`);
        row.append(inspectButton);
      } else {
        row.textContent = item.name;
      }
      items.append(row);

      if (item.hint) {
        const hint = element('p', 'garage__hint');
        hint.tabIndex = -1;
        hint.append(element('strong', '', item.name), document.createTextNode(` ${item.hint.text}`));
        const estimate = item.hint.estimatedSalePrice;
        if (estimate) {
          hint.append(element('span', 'garage__estimate', `Оценка ${dollars(estimate.min)}–${dollars(estimate.max)}`));
        }
        hints.append(hint);
        inspected.set(key, hint);
      }
    }
    if (!hints.childElementCount && buttons.size > 0) {
      hints.append(element('p', 'garage__prompt', 'Выберите предмет, чтобы осмотреть его.'));
    }
  }
  scene.append(photo);
  if (auctionOpen) scene.append(items, hints);

  const panel = element('section', 'garage__panel');
  const headingText = {
    inspection: 'Осмотр лота',
    bidding: 'Торги',
    reveal: 'Гараж куплен',
    result: view.receipt?.outcome === 'passed' ? 'Вы вышли из торгов' : 'Квитанция',
  };
  const heading = element('h2', 'garage__heading', headingText[view.phase]);
  heading.tabIndex = -1;
  heading.dataset.garageFocus = 'heading';
  const controls = element('div', 'garage__controls');
  if (allowed.has('bid') && view.nextBidAmount !== null) {
    controls.append(button(`Ставка ${dollars(view.nextBidAmount)}`, {
      type: 'bid', expectedRevision: view.revision,
    }, 'bid', 'garage__button garage__button--primary'));
  }
  if (allowed.has('pass')) {
    controls.append(button('Пас', { type: 'pass', expectedRevision: view.revision }, 'pass', 'garage__button'));
  }
  if (allowed.has('sellAll')) {
    controls.append(button(
      'Продать остаток',
      { type: 'sellAll', expectedRevision: view.revision },
      'sellAll',
      'garage__button garage__button--primary',
    ));
  }
  if (allowed.has('nextLot')) {
    controls.append(button('tier' in view ? 'К выбору торгов' : 'Следующий гараж', { type: 'nextLot', expectedRevision: view.revision }, 'nextLot', 'garage__button garage__button--primary'));
  }

  panel.append(heading, factsFor(view));
  if (view.phase === 'reveal') {
    panel.append(inventoryFor(view, button));
  }
  if (auctionOpen && !allowed.has('bid')) {
    panel.append(element('p', 'garage__prompt', `Следующая ставка ${dollars(view.nextBidAmount)} недоступна.`));
  }
  panel.append(controls);
  layout.append(scene, panel);
  screen.append(header, layout);
  root.replaceChildren(screen);

  if (view.phase === 'inspection' &&
    ((previousFocus && !focusKey) || focusKey === 'nextLot' || focusKey === 'sortGarage' || focusKey === 'title')) {
    title.focus();
  } else if (previousFocus) {
    const target = focusKey && focusKey !== 'bid' ? inspected.get(focusKey) ?? buttons.get(focusKey) : null;
    (target || heading).focus();
  }
}

function mountRecovery(root: HTMLElement, view: Extract<Stage2View, { phase: 'recovery' }>, dispatch: Stage2Dispatch): void {
  const restoreFocus = root.contains(document.activeElement);
  const screen = element('section', 'garage');
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', 'Восстановление банка');
  title.tabIndex = -1;
  header.append(title, bankFor(view.bank));

  const panel = element('div', 'garage__panel garage__panel--recovery');
  const facts = element('dl', 'garage__facts');
  addFact(facts, 'Минимальная ставка', dollars(view.minimumBid));
  addFact(facts, 'Оплата за сортировку', dollars(view.reward));
  panel.append(facts);

  if (view.allowedActions.includes('sortGarage')) {
    const sort = actionButton('Рассортировать гараж', 'garage__button garage__button--primary', () => {
      dispatch({ type: 'sortGarage', expectedRevision: view.revision });
    });
    sort.dataset.garageFocus = 'sortGarage';
    panel.append(sort);
  }
  screen.append(header, panel);
  root.replaceChildren(screen);
  if (restoreFocus) title.focus();
}

export const mountStage2: Stage2Mount = (root, view, dispatch) => {
  switch (view.phase) {
    case 'prologue':
      mountStory(root, view, dispatch);
      break;
    case 'recovery':
      mountRecovery(root, view, dispatch);
      break;
    default:
      mountAuction(root, view, dispatch);
  }
};

export const mountStage3: Stage3Mount = (root, view, dispatch) => {
  switch (view.phase) {
    case 'hub':
      mountHub(root, view, dispatch);
      break;
    case 'airportOffer':
    case 'baggageInventory':
    case 'baggageResult':
      mountBaggage(root, view, dispatch);
      break;
    case 'prologue':
    case 'recovery':
      mountStage2(root, view, dispatch);
      break;
    default:
      mountAuction(root, view, dispatch);
  }
};
