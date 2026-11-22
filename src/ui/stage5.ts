import type { Capacity, GarageItemView, Stage5Command, Stage5Dispatch, Stage5View } from '../game/stage5-contract';
import { roomNames } from '../game/stage5-contract';
import bar from './assets/stage5-bar.jpg';
import garage from './assets/stage5-garage.jpg';
import yard from './assets/stage5-yard.jpg';
import { actionButton, addFact, bankFor, element, replaceScreen, rubles } from './dom';
import { garageScenes } from './garage-scenes';
import { receiptFacts } from './inventory';
import './stage5.css';

type RoomView = Extract<Stage5View, { phase: typeof roomNames[number] }>;
type NewView = Extract<Stage5View, { phase: 'opening' | 'cargo' | 'job' | typeof roomNames[number] }>;
type WithoutRevision<Command> = Command extends Stage5Command ? Omit<Command, 'expectedRevision'> : never;
type Action = WithoutRevision<Stage5Command>;

const frames = {
  eviction: { title: 'За порогом', copy: 'Тебя выставили из дома. Сумка осталась на мокром крыльце, а идти пока некуда.', image: yard, alt: 'Мокрый двор за деревянным забором.', next: 'Выйти на улицу' },
  rain: { title: 'Ливень', copy: 'Дорогая машина влетела в лужу и обдала тебя водой. Она скрылась за поворотом. Через дорогу ещё горит свет в баре.', image: yard, alt: 'Машина уезжает по мокрой улице.', next: 'Зайти в бар' },
  call: { title: 'Неизвестный номер', copy: 'Телефон зазвонил у барной стойки. Нотариус объяснил, что бабушка переехала в другой город и оформила на тебя дарственную.', image: bar, alt: 'Герой у барной стойки, рядом звонит телефон.', next: 'Забрать ключи' },
  keys: { title: 'Теперь здесь твой дом', copy: 'Ключи от старого дома и гаража теперь у тебя. Всё, что внутри гаража, тоже твоё. Продай пару вещей, чтобы собрать деньги на торги.', image: yard, alt: 'Старый деревянный дом и железный гараж рядом.', next: 'Войти в гараж' },
} as const;

const roomLabels = { home: 'Дом', garage: 'Мой гараж', market: 'Доска объявлений', inbox: 'Отклики' } as const;
const conditions = { good: 'Хорошее', worn: 'Со следами износа', damaged: 'Требует ремонта' } as const;
const buttonClass = 'garage__button';
const primaryClass = buttonClass + ' garage__button--primary';

function art(src: string, alt: string): HTMLImageElement {
  const image = element('img', 'stage5__art');
  image.src = src;
  image.alt = alt;
  return image;
}

function capacityLabel(label: string, capacity: Capacity): string {
  return `${label} · занято ${capacity.used} из ${capacity.limit}, свободно ${capacity.limit - capacity.used}`;
}

function itemFacts(item: GarageItemView): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  addFact(facts, 'Состояние', conditions[item.condition]);
  addFact(facts, 'Оценка', `${rubles(item.estimate.min)}–${rubles(item.estimate.max)}`);
  addFact(facts, 'Занимает мест', String(item.size));
  return facts;
}

function itemIcon(item: GarageItemView): string {
  if (/чайник/i.test(item.name)) return '🫖';
  if (/велосипед/i.test(item.name)) return '🚲';
  if (/лампа|светильник/i.test(item.name)) return '💡';
  if (/радио|колонка|проигрыватель/i.test(item.name)) return '📻';
  if (/ваза|керамика/i.test(item.name)) return '🏺';
  return item.position === 'floor' ? '🧳' : '🧰';
}

export function mountNewScene(root: HTMLElement, view: NewView, dispatch: Stage5Dispatch): void {
  function send(action: Action): void {
    dispatch({ ...action, expectedRevision: view.revision });
  }

  function control(label: string, action: Action, key: string, primary = false): HTMLButtonElement {
    const button = actionButton(label, primary ? primaryClass : buttonClass, () => send(action));
    button.dataset.screenFocus = key;
    return button;
  }

  const screen = element('section', 'garage stage5');
  const label = view.phase === 'opening' ? frames[view.frame].title
    : view.phase === 'cargo' ? `Гараж куплен · лот №${view.lotNumber}`
    : view.phase === 'job' ? 'Подработка в гараже' : roomLabels[view.phase];
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', label);
  title.tabIndex = -1;
  header.append(title, bankFor(view.bank));
  screen.append(header);

  if (view.phase === 'opening') {
    const frame = frames[view.frame];
    const layout = element('div', 'stage5__layout');
    const panel = element('section', 'garage__panel');
    panel.append(element('p', 'stage5__copy', frame.copy),
      control(frame.next, { type: 'storyNext' }, 'next', true),
      control('Пропустить пролог', { type: 'skipStory' }, 'skip'));
    layout.append(art(frame.image, frame.alt), panel);
    screen.append(layout);
  } else if (view.phase === 'cargo') {
    const layout = element('div', 'stage5__layout');
    const left = element('section', 'stage5__stack');
    const scene = garageScenes[view.sceneId];
    const close = element('div', 'stage5__close');
    close.append(art(scene.image, scene.alt));
    const costs = element('dl', 'garage__facts');
    addFact(costs, 'Цена лота', rubles(view.purchasePrice));
    addFact(costs, 'Уже выручено', rubles(view.revenue));
    left.append(close, costs);
    const panel = element('section', 'stage5__stack');
    panel.append(element('p', 'stage5__capacity', capacityLabel('Машина', view.car)),
      element('p', 'stage5__capacity', capacityLabel('Гараж дома с учётом груза', view.garage)));
    for (const box of view.boxes) {
      const open = control(`Открыть: ${box.name}`, { type: 'openBox', boxId: box.id }, `box:${box.id}`);
      panel.append(open);
    }
    for (const item of view.items) {
      const card = element('article', 'garage__panel stage5__item');
      card.append(element('h2', 'hub__name', item.name), element('p', 'hub__detail', item.clue), itemFacts(item));
      const move = control(item.selected ? 'Убрать из машины' : 'Забрать домой',
        { type: 'toggleCargo', itemId: item.id }, `cargo:${item.id}`, !item.selected);
      move.setAttribute('aria-label', `${move.textContent}: ${item.name}`);
      move.setAttribute('aria-pressed', String(item.selected));
      move.disabled = item.blocked !== null;
      card.append(move);
      if (item.blocked) card.append(element('p', 'hub__reason', item.blocked));
      panel.append(card);
    }
    if (view.boxes.length || view.items.some(({ selected }) => !selected)) {
      const confirm = element('details', 'garage__panel stage5__confirm');
      confirm.append(element('summary', '', 'Оставить остальные вещи'),
        element('p', 'stage5__copy', 'Оставленные вещи и закрытые коробки останутся в купленном гараже.'),
        control('Подтвердить и поехать домой', { type: 'finishCargo', leaveRemaining: true }, 'finish', true));
      panel.append(confirm);
    } else panel.append(control('Отвезти груз домой', { type: 'finishCargo', leaveRemaining: false }, 'finish', true));
    layout.append(left, panel);
    screen.append(layout);
  } else if (view.phase === 'job') {
    const panel = element('section', 'garage__panel garage__panel--recovery');
    panel.append(element('p', 'stage5__copy', `Заказ на сортировку · оплата ${rubles(view.reward)}. Стартовая ставка ${rubles(view.minimumBid)}.`),
      element('p', 'hub__detail', `Разложено ${view.completed} из ${view.total}`));
    if (view.task) {
      panel.append(element('h2', 'garage__heading', view.task),
        control('На стеллаж', { type: 'sortItem', station: 'shelf' }, 'shelf'),
        control('На пол', { type: 'sortItem', station: 'floor' }, 'floor'),
        control('На переработку', { type: 'sortItem', station: 'recycle' }, 'recycle'));
      if (view.incorrect) {
        const error = element('p', 'hub__reason', 'Для этой вещи нужно другое место.');
        error.setAttribute('role', 'status');
        panel.append(error);
      }
    } else panel.append(control('Получить оплату', { type: 'claimJob' }, 'claim', true));
    screen.append(panel);
  } else {
    mountRoomContents(screen, view, control, send);
  }
  replaceScreen(root, screen, title);
}

type Control = (label: string, action: Action, key: string, primary?: boolean) => HTMLButtonElement;

function mountRoomContents(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void): void {
  const navigation = element('nav', 'stage5__nav');
  navigation.setAttribute('aria-label', 'Места');
  for (const room of roomNames) {
    const label = room === 'inbox' && view.unread ? `Отклики (${view.unread})` : roomLabels[room];
    const item = button(label, { type: 'navigate', room }, room);
    if (room === view.phase) item.setAttribute('aria-current', 'page');
    navigation.append(item);
  }
  navigation.append(button('К торгам', { type: 'navigate', room: 'auctions' }, 'auctions', true));
  screen.append(navigation);

  if (view.phase === 'home') {
    const photo = art(yard, 'Дом и соседний гараж на тихой улице.');
    photo.classList.add('stage5__home');
    screen.append(photo);
  }
  if (view.phase === 'garage') renderGarage(screen, view, button);
  if (view.phase === 'market' || view.phase === 'inbox') renderMarket(screen, view, button, send);

  if (view.lastSale || view.lastDeal || view.deals.length) {
    const records = element('section', 'garage__panel stage5__records');
    if (view.lastSale) records.append(element('p', 'stage5__copy', `Продано: ${view.lastSale.name} · ${rubles(view.lastSale.price)}`));
    for (const deal of view.deals) {
      records.append(element('p', 'hub__detail',
        `Лот №${deal.lotNumber} · покупка ${rubles(deal.cost)}, выручка ${rubles(deal.revenue)}. Продажа продолжается.`));
    }
    if (view.lastDeal) {
      records.append(element('h2', 'garage__heading', `Итог лота №${view.lastDeal.lotNumber}`), receiptFacts(view.lastDeal.receipt, view.bank));
    }
    screen.append(records);
  }
}

function renderGarage(screen: HTMLElement, view: RoomView, button: Control): void {
  screen.append(element('p', 'stage5__capacity', capacityLabel('Гараж', view.garage)));
  const layout = element('div', 'stage5__layout');
  const left = element('section', 'stage5__stack');
  const scene = element('div', 'stage5__garage-art');
  scene.append(art(garage, 'Интерьер гаража со стеллажами и свободным полом.'));
  const details = element('section', 'garage__panel');
  const list = element('section', 'stage5__stack');
  const selectorButtons: { control: HTMLButtonElement; item: GarageItemView }[] = [];

  function inspect(item: GarageItemView): void {
    for (const entry of selectorButtons) entry.control.setAttribute('aria-pressed', String(entry.item.id === item.id));
    const graphic = element('span', 'stage5__object', itemIcon(item));
    graphic.setAttribute('aria-hidden', 'true');
    const discard = element('details', 'stage5__confirm');
    discard.append(element('summary', '', 'Освободить место'),
      button(`Подтвердить отказ: ${item.name}`, { type: 'discardItem', itemId: item.id }, `discard:${item.id}`));
    details.replaceChildren(element('h2', 'garage__heading', item.name), graphic,
      element('p', 'stage5__copy', item.clue), itemFacts(item),
      button('К объявлениям', { type: 'navigate', room: 'market' }, 'market-selected'), discard);
  }

  for (const position of ['shelf', 'floor'] as const) {
    const items = view.items.filter((item) => item.position === position);
    if (!items.length) continue;
    const group = element('section', 'garage__panel stage5__slots');
    const label = position === 'shelf' ? 'На стеллаже' : 'На полу';
    group.append(element('h2', 'hub__name', label));
    const markers = element('div', 'stage5__markers stage5__markers--' + position);
    for (const item of items) {
      const target = actionButton(item.name, buttonClass, () => inspect(item));
      const marker = actionButton(itemIcon(item), buttonClass + ' stage5__marker', () => inspect(item));
      target.setAttribute('aria-label', `Осмотреть: ${item.name}`);
      marker.setAttribute('aria-label', `Выбрать в гараже: ${item.name}`);
      target.dataset.screenFocus = `item:${item.id}`;
      marker.dataset.screenFocus = `scene:${item.id}`;
      selectorButtons.push({ control: target, item }, { control: marker, item });
      group.append(target);
      markers.append(marker);
    }
    scene.append(markers);
    list.append(group);
  }

  if (view.items[0]) inspect(view.items[0]);
  else details.append(element('p', 'stage5__copy', 'Гараж пуст. Новые находки можно привезти с торгов.'));
  left.append(scene, details);
  layout.append(left, list);
  screen.append(layout);
}

function renderMarket(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void): void {
  const cards = element('div', 'stage5__market');
  if (view.phase === 'market') {
    for (const item of view.items) {
      const listing = view.listings.find(({ itemId }) => itemId === item.id);
      const card = element('article', 'garage__panel');
      card.append(element('h2', 'garage__heading', item.name), itemFacts(item));
      if (listing) card.append(element('p', 'hub__detail', `Запрошено ${rubles(listing.price)}. ${listing.offer ? 'Есть отклик.' : 'Ждём покупателя.'}`));
      const form = element('form', 'stage5__form');
      const price = element('input', 'stage5__price');
      price.type = 'number';
      price.min = '1';
      price.step = '1';
      price.max = String(Number.MAX_SAFE_INTEGER);
      price.required = true;
      price.value = String(listing?.price ?? Math.round((item.estimate.min + item.estimate.max) / 2));
      const label = element('label', '', 'Цена, ₽');
      label.append(price);
      const publish = element('button', primaryClass, listing ? 'Обновить цену' : 'Опубликовать');
      publish.type = 'submit';
      publish.dataset.screenFocus = `publish:${item.id}`;
      publish.setAttribute('aria-label', `${publish.textContent}: ${item.name}`);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        send({ type: 'publish', itemId: item.id, price: price.valueAsNumber });
      });
      form.append(label, publish);
      card.append(form);
      cards.append(card);
    }
    if (!view.items.length) cards.append(element('p', 'stage5__copy', 'Пока нечего выставить. Привези находку с торгов.'));
  } else {
    for (const listing of view.listings) {
      const offer = listing.offer;
      const item = view.items.find(({ id }) => id === listing.itemId);
      if (!offer || !item) continue;
      const card = element('article', 'garage__panel');
      card.append(element('h2', 'garage__heading', item.name),
        element('p', 'hub__detail', `Запрошено ${rubles(listing.price)}`),
        element('p', 'stage5__copy', `${offer.buyer} предлагает ${rubles(offer.price)}.`));
      if (offer.unread) card.append(button('Прочитать отклик', { type: 'readOffer', listingId: listing.id, offerId: offer.id }, `read:${offer.id}`));
      card.append(button(`Продать за ${rubles(offer.price)}`,
        { type: 'acceptOffer', listingId: listing.id, offerId: offer.id }, `accept:${offer.id}`, true));
      cards.append(card);
    }
    if (!cards.childElementCount) cards.append(element('p', 'stage5__copy', 'Откликов пока нет.'));
  }

  if (view.listings.length) screen.append(button('Подождать покупателя', { type: 'waitForBuyer' }, 'wait', true));
  screen.append(cards);
}
