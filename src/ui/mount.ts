import type { Stage2AuctionView, Stage2Command, Stage2Dispatch, Stage2Mount, Stage2View } from '../game/stage2-contract';
import { garageScenes } from './garage-scenes';
import { mountStory } from './story';
import './garage.css';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dollars(amount: number): string {
  return amount < 0 ? `−$${Math.abs(amount)}` : `$${amount}`;
}

function bankFor(amount: number): HTMLParagraphElement {
  const bank = element('p', 'garage__bank');
  bank.append(element('span', '', 'Банк'), element('strong', '', dollars(amount)));
  return bank;
}

function actionButton(label: string, className: string, activate: () => void): HTMLButtonElement {
  const control = element('button', className, label);
  control.type = 'button';
  control.addEventListener('click', activate);
  control.addEventListener('keydown', (event) => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  });
  return control;
}

function addFact(list: HTMLDListElement, label: string, value: string): void {
  const row = element('div', 'garage__fact');
  row.append(element('dt', '', label), element('dd', '', value));
  list.append(row);
}

function factsFor(view: Stage2AuctionView): HTMLDListElement {
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
      addFact(facts, 'Цена покупки', dollars(view.purchasePrice));
      addFact(facts, 'Получено от продаж', dollars(view.revenue));
      break;
    case 'result': {
      const receipt = view.receipt;
      if (receipt.outcome === 'passed') {
        addFact(facts, 'Списано', dollars(receipt.purchasePrice));
      } else {
        addFact(facts, 'Покупка', dollars(receipt.purchasePrice));
        addFact(facts, 'Выручка', dollars(receipt.revenue));
        const prefix = receipt.profit > 0 ? '+' : '';
        const label = receipt.profit < 0 ? 'Убыток' : 'Прибыль';
        addFact(facts, label, prefix + dollars(receipt.profit));
        addFact(facts, 'Банк', dollars(view.bank));
      }
      break;
    }
  }
  return facts;
}

function mountAuction(root: HTMLElement, view: Stage2AuctionView, dispatch: Stage2Dispatch): void {
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
    controls.append(button('Следующий гараж', { type: 'nextLot', expectedRevision: view.revision }, 'nextLot', 'garage__button garage__button--primary'));
  }

  panel.append(heading, factsFor(view));
  if (view.phase === 'reveal') {
    const { revision, sealedBoxes, revealedFinds } = view;
    const inventory = element('ul', 'garage__inventory');
    for (const box of sealedBoxes) {
      const card = element('li', 'garage__inventory-item');
      card.append(element('strong', '', box.name));
      if (allowed.has('openBox')) {
        const open = button(
          'Открыть',
          { type: 'openBox', boxId: box.id, expectedRevision: revision },
          `box:${box.id}`,
          'garage__button',
        );
        open.setAttribute('aria-label', `Открыть: ${box.name}`);
        card.append(open);
      }
      inventory.append(card);
    }
    for (const find of revealedFinds) {
      const card = element('li', 'garage__inventory-item');
      const description = element('div', 'garage__inventory-description');
      description.append(element('strong', '', find.name), element('span', '', dollars(find.salePrice)));
      card.append(description);
      if (allowed.has('sellItem')) {
        const sell = button(
          'Продать',
          { type: 'sellItem', itemId: find.id, expectedRevision: revision },
          `find:${find.id}`,
          'garage__button',
        );
        sell.setAttribute('aria-label', `Продать: ${find.name}`);
        card.append(sell);
      }
      inventory.append(card);
    }
    if (inventory.childElementCount > 0) panel.append(inventory);
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
  } else if (focusKey) {
    const target = inspected.get(focusKey) ??
      (focusKey === 'bid' ? heading : buttons.get(focusKey)) ?? heading;
    target.focus();
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
