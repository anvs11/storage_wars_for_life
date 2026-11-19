import type { Command, GameView, Mount } from '../game/contract';
import garageImage from './assets/tutorial-garage.png';
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

function addFact(list: HTMLDListElement, label: string, value: string): void {
  const row = element('div', 'garage__fact');
  row.append(element('dt', '', label), element('dd', '', value));
  list.append(row);
}

function factsFor(view: GameView): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  switch (view.phase) {
    case 'inspection':
      addFact(facts, 'Стартовая ставка', dollars(view.nextBidAmount));
      break;
    case 'bidding':
      addFact(facts, 'Ваша ставка', dollars(view.lastPlayerBid));
      addFact(facts, 'Соперник', dollars(view.currentPrice));
      break;
    case 'reveal':
      addFact(facts, 'Цена покупки', dollars(view.purchasePrice));
      for (const find of view.revealedFinds) {
        addFact(facts, find.name, dollars(find.salePrice));
      }
      break;
    case 'result': {
      const receipt = view.receipt;
      if (receipt.outcome === 'passed') {
        addFact(facts, 'Списано', dollars(receipt.purchasePrice));
      } else {
        addFact(facts, 'Покупка', dollars(receipt.purchasePrice));
        addFact(facts, 'Выручка', dollars(receipt.revenue));
        const prefix = receipt.profit > 0 ? '+' : '';
        addFact(facts, 'Прибыль', prefix + dollars(receipt.profit));
        addFact(facts, 'Банк', dollars(view.bank));
      }
      break;
    }
  }
  return facts;
}

export const mount: Mount = (root, view, dispatch) => {
  const previousFocus = root.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = previousFocus?.getAttribute('data-garage-focus');
  const allowed = new Set<Command['type']>(view.allowedActions);
  const buttons = new Map<string, HTMLButtonElement>();

  function button(label: string, command: Command, key: string, className: string): HTMLButtonElement {
    const control = element('button', className, label);
    control.type = 'button';
    control.dataset.garageFocus = key;
    control.addEventListener('click', () => dispatch(command));
    control.addEventListener('keydown', (event) => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    buttons.set(key, control);
    return control;
  }

  const screen = element('section', 'garage');
  screen.setAttribute('aria-label', 'Учебный гараж');
  const header = element('header', 'garage__header');
  const bank = element('p', 'garage__bank');
  bank.append(element('span', '', 'Банк'), element('strong', '', dollars(view.bank)));
  header.append(element('h1', 'garage__title', 'Учебный гараж'), bank);

  const layout = element('div', 'garage__layout');
  const scene = element('div', 'garage__scene');
  const photo = element('img', 'garage__photo');
  photo.src = garageImage;
  photo.alt = 'Открытый гараж. Слева велосипед, справа заклеенная коробка.';
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
    controls.append(button('Продать всё', { type: 'sellAll', expectedRevision: view.revision }, 'sellAll', 'garage__button garage__button--primary'));
  }
  if (allowed.has('nextLot')) {
    controls.append(button('Следующий гараж', { type: 'nextLot', expectedRevision: view.revision }, 'nextLot', 'garage__button garage__button--primary'));
  }

  panel.append(heading, factsFor(view));
  if (auctionOpen && !allowed.has('bid')) {
    panel.append(element('p', 'garage__prompt', `Следующая ставка ${dollars(view.nextBidAmount)} недоступна.`));
  }
  panel.append(controls);
  layout.append(scene, panel);
  screen.append(header, layout);
  root.replaceChildren(screen);

  if (focusKey) {
    const target = inspected.get(focusKey) ??
      (focusKey === 'bid' ? heading : buttons.get(focusKey)) ?? heading;
    target.focus();
  }
};
