import type { Capacity, GarageItemView, Stage5Command, Stage5Dispatch, Stage5View } from '../game/stage5-contract';
import { breakageChance, marketOffers } from '../game/market-dialogue';
import { roomNames } from '../game/stage5-contract';
import type { FleaView, Stage7Dispatch } from '../game/stage7-engine';
import door from './assets/story-door.jpg';
import rain from './assets/story-rain.jpg';
import keys from './assets/story-keys-zhiguli.jpg';
import { placeProp, sceneSprite, stackedBoxes } from './scene-sprites';
import './object-scenes.css';
import bar from './assets/stage5-bar.jpg';
import garage from './assets/stage5-garage.jpg';
import yard from './assets/stage5-yard.jpg';
import renovatedYard from './assets/yard-renovated.jpg';
import courier from './assets/stage6-courier.jpg';
import caseClosed from './assets/stage6-suitcase-closed.png';
import caseOpen from './assets/stage6-suitcase-open.png';
import travelKit from './assets/stage6-travel-kit.png';
import travelSpeaker from './assets/stage6-travel-speaker.png';
import travelCamera from './assets/stage6-travel-camera.png';
import { actionButton, addFact, bankFor, element, replaceScreen, rubles } from './dom';
import { garageScenes } from './garage-scenes';
import { vehicleName, vehiclePicture } from './vehicle';
import { receiptFacts } from './inventory';
import './stage5.css';

type RoomView = Extract<Stage5View, { phase: typeof roomNames[number] }>;
type NewView = Extract<Stage5View, { phase: 'opening' | 'cargo' | 'job' | 'baggageArrival' | typeof roomNames[number] }>;
type WithoutRevision<Command> = Command extends Stage5Command ? Omit<Command, 'expectedRevision'> : never;
type Action = WithoutRevision<Stage5Command>;

const frames = {
  eviction: { title: 'За порогом', copy: 'Тебя выставили из дома. Сумка осталась на мокром крыльце, а идти пока некуда.', image: door, alt: 'Герой с сумкой выходит за дверь, родители остаются внутри.', next: 'Выйти на улицу' },
  rain: { title: 'Ливень', copy: 'Дорогая машина влетела в лужу и обдала тебя водой. Она скрылась за поворотом. Через дорогу ещё горит свет в баре.', image: rain, alt: 'Вода из-под колёс машины окатывает героя.', next: 'Зайти в бар' },
  call: { title: 'Неизвестный номер', copy: 'Телефон зазвонил у барной стойки. Нотариус объяснил, что бабушка переехала и оформила на тебя дарственную. Тебе достались её дом, гараж и старенькие чёрные Жигули.', image: bar, alt: 'Герой у барной стойки, рядом звонит телефон.', next: 'Забрать ключи' },
  keys: { title: 'Теперь здесь твой дом', copy: 'Теперь у тебя ключи от дома, гаража и бабушкиных Жигулей. В гараже остались вещи, которые можно продать, чтобы собрать деньги на торги.', image: keys, alt: 'Нотариус передаёт связку ключей. Позади дом, гараж и машина.', next: 'Войти в гараж' },
} as const;

const roomLabels = { home: 'Дом', garage: 'Мой гараж', market: 'Доска объявлений', inbox: 'Сообщения', car: 'Моя машина' } as const;
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
  addFact(facts, 'Риск поломки', `${breakageChance[item.condition]}%`);
  const { min, max } = item.estimate;
  addFact(facts, 'Оценка', min === max ? rubles(min) : `${rubles(min)}–${rubles(max)}`);
  addFact(facts, 'Занимает мест', String(item.size));
  return facts;
}

export interface FleaControls {
  readonly data: FleaView;
  readonly dispatch: Stage7Dispatch;
}

export function mountNewScene(root: HTMLElement, view: NewView, dispatch: Stage5Dispatch, flea?: FleaControls): void {
  function send(action: Action): void {
    dispatch({ ...action, expectedRevision: view.revision });
  }

  function control(label: string, action: Action, key: string, primary = false): HTMLButtonElement {
    const button = actionButton(label, primary ? primaryClass : buttonClass, () => send(action));
    button.dataset.screenFocus = key;
    return button;
  }

  function packControl(item: GarageItemView, baggage = false): HTMLElement | null {
    const entry = flea?.data.packing.find(({ id }) => id === item.id);
    if (!flea || !entry) return null;
    const label = entry.selected ? 'Убрать из коробки' : 'На барахолку';
    const button = actionButton(label, buttonClass, () => flea.dispatch({
      type: baggage ? 'toggleFleaBaggage' : 'packForFlea', expectedRevision: view.revision, itemId: item.id,
    }));
    button.setAttribute('aria-label', `${label}: ${item.name}`);
    button.disabled = entry.blocked !== null;
    const row = element('div', 'stage5__stack');
    row.append(button);
    if (entry.blocked) row.append(element('p', 'hub__reason', entry.blocked));
    return row;
  }

  const packed = (id: string) => flea?.data.packing.some((item) => item.id === id && item.selected) ?? false;

  const screen = element('section', 'garage stage5');
  const label = view.phase === 'opening' ? frames[view.frame].title
    : view.phase === 'baggageArrival' ? 'Курьер из аэропорта'
    : view.phase === 'cargo' ? view.baggage ? 'Чемодан' : `Гараж куплен · лот №${view.lotNumber}`
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
  } else if (view.phase === 'baggageArrival') {
    const layout = element('div', 'stage5__layout');
    const panel = element('section', 'garage__panel');
    panel.append(element('p', 'stage5__copy', 'Курьер приехал с оплаченным чемоданом. Забери его и посмотри, что внутри.'),
      control('Забрать чемодан', { type: 'receiveBaggage' }, 'receive', true));
    layout.append(art(courier, 'Курьер с чемоданом у дома.'), panel);
    screen.append(layout);
  } else if (view.phase === 'cargo') {
    const layout = element('div', 'stage5__layout');
    const left = element('section', 'stage5__stack');
    const scene = garageScenes[view.sceneId];
    const close = element('div', view.baggage ? `suitcase suitcase--${view.floor ?? 'boards'}` : 'stage5__close');
    const dialog = element('dialog', 'object-dialog cargo-dialog');
    dialog.setAttribute('aria-labelledby', 'cargo-item-title');
    const details = element('section', 'garage__panel');
    dialog.append(details);
    const finds = element('div', view.baggage ? 'suitcase__finds' : 'cargo-objects');
    const otherFinds = element('div', 'cargo-other');
    const staged = !view.baggage;
    if (staged) close.classList.add('cargo-scene', 'door-scene--' + view.sceneId);
    const closed = view.boxes.length > 0;
    close.append(view.baggage
      ? art(closed ? caseClosed : caseOpen, closed ? 'Закрытый чемодан.' : 'Раскрытый чемодан, вид сверху.')
      : art(scene.image, scene.alt));

    const baggage = view.baggage;
    function itemPicture(item: GarageItemView): HTMLImageElement | null {
      if (!baggage) return sceneSprite(item.name);
      const picture = element('img', 'suitcase__item');
      picture.src = /фотоаппарат/i.test(item.name) ? travelCamera : /колонка/i.test(item.name) ? travelSpeaker : travelKit;
      picture.alt = '';
      return picture;
    }

    for (const [index, item] of view.items.entries()) {
      const picture = itemPicture(item);
      const fromBox = item.id.includes('-box-') || view.sceneId === 'tutorial' && index > 0;
      const inScene = view.baggage || (staged && index < 4 && (!fromBox || index === 3 || view.sceneId === 'tutorial' && index === 1));
      const pick = actionButton('', inScene ? 'cargo-target' : buttonClass, () => {
        const heading = element('h2', 'garage__heading', item.name);
        heading.id = 'cargo-item-title';
        heading.tabIndex = -1;
        const preview = itemPicture(item);
        const move = control(item.selected ? view.baggage ? 'Оставить в чемодане' : 'Убрать из машины'
          : view.baggage ? 'В гараж' : 'Забрать домой', { type: 'toggleCargo', itemId: item.id }, `cargo:${item.id}`, !item.selected);
        move.disabled = item.blocked !== null || packed(item.id);
        move.setAttribute('aria-label', `${move.textContent}: ${item.name}`);
        const leave = item.selected ? 'Назад к вещам' : view.baggage ? 'Оставить в чемодане' : 'Оставить здесь';
        const dismiss = actionButton(leave, buttonClass, () => dialog.close());
        details.replaceChildren(heading);
        if (preview) {
          const showcase = element('div', 'cargo-showcase');
          showcase.append(preview);
          details.append(showcase);
        }
        details.append(element('p', 'hub__detail', item.clue), itemFacts(item));
        if (item.selected) details.append(element('p', 'cargo-picked', view.baggage ? 'Выбрано для гаража' : 'Уже в машине'));
        if (item.blocked) details.append(element('p', 'hub__reason', item.blocked));
        const actions = element('div', 'garage__controls');
        actions.append(move, dismiss);
        details.append(actions);
        const pack = view.baggage ? packControl(item, true) : null;
        if (pack) details.append(pack);
        dialog.showModal();
        heading.focus();
      });
      pick.dataset.screenFocus = `pick:${item.id}`;
      pick.setAttribute('aria-label', `Осмотреть: ${item.name}`);
      if (item.selected || packed(item.id)) pick.dataset.loaded = '';
      if (picture && inScene) pick.append(picture);
      const label = element('span', 'cargo-target__label', item.name);
      pick.append(label);
      if (inScene && !view.baggage) {
        placeProp(pick, item.name, fromBox ? 0 : index, fromBox, fromBox);
      }
      (inScene ? finds : otherFinds).append(pick);
    }

    for (const [index, box] of view.boxes.entries()) {
      const label = view.baggage ? 'Открыть чемодан' : box.name === 'Вещи за ширмой' ? 'Отодвинуть ширму' : `Открыть: ${box.name}`;
      const open = control(label, { type: 'openBox', boxId: box.id }, `open:${box.id}`);
      if (staged) {
        open.className = 'cargo-target';
        open.setAttribute('aria-label', label);
        const caption = element('span', 'cargo-target__label', label);
        open.replaceChildren(caption);
        const sprite = view.sceneId === 'workshop' && box.name !== 'Вещи за ширмой'
          ? stackedBoxes() : sceneSprite(box.name);
        if (sprite) open.prepend(sprite);
        if (box.name === 'Вещи за ширмой') open.prepend(stackedBoxes());
        placeProp(open, box.name, index, true);
        finds.append(open);
      } else otherFinds.append(open);
    }
    if (finds.childElementCount) close.append(finds);
    const costs = element('dl', 'garage__facts');
    addFact(costs, view.baggage ? 'Цена чемодана' : 'Цена лота', rubles(view.purchasePrice));
    addFact(costs, 'Уже выручено', rubles(view.revenue));
    left.append(close, costs);
    if (otherFinds.childElementCount) left.append(otherFinds);
    const panel = element('section', 'stage5__stack');
    if (!view.baggage) panel.append(element('p', 'stage5__capacity', capacityLabel('Машина', view.car)));
    panel.append(element('p', 'stage5__capacity', capacityLabel('Гараж дома с учётом выбора', view.garage)));
    if (view.jewelry) panel.append(element('p', 'stage5__capacity', capacityLabel('Шкатулка', view.jewelry)));
    screen.append(dialog);
    if (view.boxes.length || view.items.some(({ id, selected }) => !selected && !packed(id))) {
      const confirm = element('details', 'garage__panel stage5__confirm');
      confirm.append(element('summary', '', 'Оставить остальные вещи'),
        element('p', 'stage5__copy', view.baggage ? 'Невыбранные вещи будут оставлены.' : 'Оставленные вещи и закрытые коробки останутся в купленном гараже.'),
        control(view.baggage ? 'Подтвердить разбор' : 'Подтвердить и поехать домой', { type: 'finishCargo', leaveRemaining: true }, 'finish', true));
      panel.append(confirm);
    } else {
      const label = view.items.some(({ id }) => packed(id)) ? 'Сохранить находки'
        : view.baggage ? 'Сохранить вещи в гараже' : 'Отвезти груз домой';
      panel.append(control(label, { type: 'finishCargo', leaveRemaining: false }, 'finish', true));
    }
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
    mountRoomContents(screen, view, control, send, packControl);
  }
  const previousKey = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.screenFocus : undefined;
  if (view.phase === 'inbox') {
    for (const thread of screen.querySelectorAll<HTMLDetailsElement>('[data-thread]')) {
      thread.open = previousKey?.endsWith(':' + thread.dataset.thread) ?? false;
    }
  }
  replaceScreen(root, screen, title);
  if (view.phase === 'cargo' && previousKey?.startsWith('cargo:')) {
    const key = 'pick:' + previousKey.slice(6);
    const trigger = Array.from(screen.querySelectorAll<HTMLElement>('[data-screen-focus]'))
      .find(node => node.dataset.screenFocus === key);
    trigger?.focus({ preventScroll: true });
  }
}

type Control = (label: string, action: Action, key: string, primary?: boolean) => HTMLButtonElement;

function mountRoomContents(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void,
  pack?: (item: GarageItemView) => HTMLElement | null): void {
  const navigation = element('nav', 'stage5__nav');
  navigation.setAttribute('aria-label', 'Места');
  for (const room of roomNames) {
    const label = room === 'inbox' && view.unread ? `Сообщения (${view.unread})` : roomLabels[room];
    const item = button(label, { type: 'navigate', room }, room);
    if (room === view.phase) item.setAttribute('aria-current', 'page');
    navigation.append(item);
  }
  navigation.append(button('К торгам', { type: 'navigate', room: 'auctions' }, 'auctions', true));
  screen.append(navigation);

  if (view.phase === 'home') {
    const photo = art(view.homeImproved ? renovatedYard : yard,
      view.homeImproved ? 'Отремонтированный дом и гараж.' : 'Старый дом и соседний гараж.');
    photo.classList.add('stage5__home');
    const yardScene = element('div', 'yard-scene');
    yardScene.append(photo);
    for (const [label, room, selector] of [
      ['Дом', 'auctions', '[data-home-offer]'],
      ['Гараж', 'garage', '.shelf-scene'],
    ] as const) {
      const hotspot = actionButton(label, 'yard-pin', () => {
        send({ type: 'navigate', room });
        const destination = document.querySelector<HTMLElement>(selector);
        if (destination instanceof HTMLDetailsElement) destination.open = true;
        if (destination) {
          destination.tabIndex = -1;
          destination.focus();
        }
      });
      yardScene.append(hotspot);
    }
    const car = button('', { type: 'navigate', room: 'car' }, 'yard-car');
    car.className = 'yard-car';
    car.setAttribute('aria-label', 'Осмотреть машину');
    car.append(vehiclePicture(view.vehicle?.model ?? 'zhiguli'), element('span', '', 'Машина'));
    yardScene.append(car);
    navigation.before(yardScene);
  }
  if (view.phase === 'garage') renderGarage(screen, view, button, send, pack);
  if (view.phase === 'car' && view.vehicle) {
    const layout = element('div', 'stage5__layout vehicle-layout');
    const picture = element('div', 'vehicle-display');
    picture.append(vehiclePicture(view.vehicle.model));
    const panel = element('section', 'garage__panel');
    const facts = element('dl', 'garage__facts');
    addFact(facts, 'Машина', vehicleName[view.vehicle.model]);
    addFact(facts, 'Мест для груза', String(view.vehicle.capacity));
    panel.append(facts);
    const upgrade = view.upgrades?.find(({ target }) => target === 'car');
    if (upgrade) {
      panel.append(element('h2', 'garage__heading', 'Вместительный фургон'),
        element('p', 'hub__detail', `Число мест для груза · ${upgrade.current} → ${upgrade.next}`));
      const buy = button(`Купить за ${rubles(upgrade.price)}`, { type: 'buyCapacity', target: 'car' }, 'upgrade:car', true);
      buy.disabled = !upgrade.available;
      if (!upgrade.available) panel.append(element('p', 'hub__reason', `Не хватает ${rubles(upgrade.price - view.bank)}.`));
      panel.append(buy);
    }
    panel.append(button('Во двор', { type: 'navigate', room: 'home' }, 'yard-car'));
    layout.append(picture, panel);
    navigation.before(layout);
  }
  if (view.phase === 'market' || view.phase === 'inbox') renderMarket(screen, view, button, send);

  if (view.lastSale || view.lastDeal || view.deals.length) {
    const records = element('section', 'garage__panel stage5__records');
    if (view.lastSale) records.append(element('p', 'stage5__copy', `Продано: ${view.lastSale.name} · ${rubles(view.lastSale.price)}`));
    for (const deal of view.deals) {
      records.append(element('p', 'hub__detail',
        `${deal.lotNumber === null ? 'Чемодан' : `Лот №${deal.lotNumber}`} · покупка ${rubles(deal.cost)}, ремонт ${rubles(deal.repairCost ?? 0)}, выручка ${rubles(deal.revenue)}. Продажа продолжается.`));
    }
    if (view.lastDeal) {
      records.append(element('h2', 'garage__heading', view.lastDeal.lotNumber === null ? 'Итог по чемодану' : `Итог лота №${view.lastDeal.lotNumber}`), receiptFacts(view.lastDeal.receipt, view.bank, view.lastDeal.repairCost));
    }
    screen.append(records);
  }
}

function renderGarage(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void, pack?: (item: GarageItemView) => HTMLElement | null): void {
  screen.append(element('p', 'stage5__capacity', capacityLabel('Гараж', view.garage)));
  if (view.jewelry) screen.append(element('p', 'stage5__capacity', capacityLabel('Шкатулка', view.jewelry)));
  const upgrade = view.upgrades?.find(({ target }) => target === 'garage');
  if (upgrade) {
    const details = element('details', 'garage__panel stage5__confirm');
    const buy = button(`Подтвердить за ${rubles(upgrade.price)}`, { type: 'buyCapacity', target: 'garage' }, 'upgrade:garage', true);
    buy.disabled = !upgrade.available;
    details.append(element('summary', '', 'Расширить гараж'), element('p', 'hub__detail',
      `${upgrade.current} → ${upgrade.next} мест · ${rubles(upgrade.price)}`), buy);
    screen.append(details);
  }
  const scene = element('section', 'shelf-scene');
  scene.style.backgroundImage = `linear-gradient(0deg, #18160eb0, transparent), url("${garage}")`;
  scene.setAttribute('aria-label', 'Вещи в гараже');
  const dialog = element('dialog', 'object-dialog');
  dialog.setAttribute('aria-labelledby', 'owned-item-title');
  const details = element('section', 'garage__panel');

  function inspect(item: GarageItemView): void {
    const graphic = sceneSprite(item.name);
    const publish = actionButton('К объявлению', primaryClass, () => {
      dialog.close();
      send({ type: 'navigate', room: 'market' });
      document.getElementById('price-' + item.id)?.focus();
    });
    const heading = element('h2', 'garage__heading', item.name);
    heading.id = 'owned-item-title';
    const close = actionButton('Закрыть', buttonClass, () => dialog.close());
    const discard = element('details', 'stage5__confirm');
    discard.append(element('summary', '', 'Освободить место'),
      button(`Подтвердить отказ: ${item.name}`, { type: 'discardItem', itemId: item.id }, `discard:${item.id}`));
    details.replaceChildren(heading);
    if (graphic) details.append(graphic);
    details.append(element('p', 'stage5__copy', item.clue), itemFacts(item), publish, discard, close);
    const packing = pack?.(item);
    if (packing) details.append(packing);
    if (item.repair) {
      const quote = item.repair;
      const workshop = element('details', 'stage5__confirm');
      const confirm = button(`Подтвердить ремонт за ${rubles(quote.price)}`, { type: 'repairItem', itemId: item.id }, `repair:${item.id}`, true);
      confirm.disabled = !quote.available;
      workshop.append(element('summary', '', `Ремонт · ${rubles(quote.price)}`),
        element('p', 'hub__detail', `Риск поломки после ремонта · ${breakageChance.good}%. Оценка · ${rubles(quote.estimate.min)}–${rubles(quote.estimate.max)}`), confirm);
      details.append(workshop);
    }
  }

  dialog.append(details);
  for (const position of ['shelf', 'floor', 'jewelryBox'] as const) {
    const items = view.items.filter(item => item.position === position);
    if (!items.length) continue;
    const group = element('div', `object-shelf object-shelf--${position}`);
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', { shelf: 'Стеллаж', floor: 'На полу', jewelryBox: 'В шкатулке' }[position]);
    for (const item of items) {
      const target = actionButton('', 'shelf-item', () => {
        inspect(item);
        dialog.showModal();
      });
      target.dataset.screenFocus = 'scene:' + item.id;
      target.setAttribute('aria-label', 'Осмотреть: ' + item.name);
      const sprite = sceneSprite(item.name);
      if (sprite) target.append(sprite);
      target.append(element('span', '', item.name));
      group.append(target);
    }
    scene.append(group);
  }
  if (!view.items.length) scene.append(element('p', 'garage__panel', 'Гараж пуст. Новые находки можно привезти с торгов.'));
  const navigation = screen.querySelector('nav');
  if (navigation) navigation.before(scene);
  else screen.append(scene);
  screen.append(dialog);
}

function renderMarket(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void): void {
  const help = element('details', 'garage__panel sales-help');
  const steps = element('ol', '');
  for (const text of [
    'В гараже выбери вещь и нажми «К объявлению». Сверься с оценкой и назначь цену.',
    'В «Сообщениях» открой диалог. Можно принять предложение, написать встречную цену или вернуться к разговору позже.',
    'Деньги поступают в банк после подтверждения продажи. Остальные диалоги об этой вещи закрываются.',
    `Если вещь работает, покупатель ставит 4 или 5 звёзд. Оценка от 1 до 3 возможна при поломке. Риск с износом — ${breakageChance.worn}%, если вещь требует ремонта — ${breakageChance.damaged}%. Ремонт убирает риск.`,
  ]) steps.append(element('li', '', text));
  help.append(element('summary', '', 'Как работает продажа'), steps);
  screen.append(help);
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
      price.id = 'price-' + item.id;
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
      if (listing) card.append(button('Снять объявление', { type: 'cancelListing', listingId: listing.id }, `cancel:${listing.id}`));
      cards.append(card);
    }
    if (!view.items.length) cards.append(element('p', 'stage5__copy', 'Пока нечего выставить. Привези находку с торгов.'));
  } else {
    for (const listing of view.listings) {
      const item = view.items.find(({ id }) => id === listing.itemId);
      if (!item) continue;
      for (const offer of marketOffers(listing)) {
        const card = element('details', 'garage__panel market-thread');
        if (!offer.closed) card.dataset.activeOffer = '';
        const threadId = offer.id.split('@')[0]!;
        card.dataset.thread = threadId;
        const summary = element('summary', '', `${offer.buyer} · ${item.name}${offer.unread ? ' · новое' : ''}`);
        summary.dataset.screenFocus = 'chat:' + threadId;
        card.append(summary, element('p', 'hub__detail', `Цена объявления · ${rubles(listing.price)}`));
        const messages = element('ul', 'market-messages');
        for (const message of offer.messages ?? [{ side: 'buyer', text: `Предлагаю ${rubles(offer.price)}.` }]) {
          const line = element('li', 'market-message market-message--' + message.side);
          line.append(element('strong', '', message.side === 'player' ? 'Вы' : offer.buyer), element('p', '', message.text));
          messages.append(line);
        }
        card.append(messages);
        if (offer.closed) {
          card.append(element('p', 'hub__reason', 'Покупатель вышел из диалога.'));
        } else {
          const accept = button(`${offer.delivery ? 'Оформить доставку за' : 'Продать за'} ${rubles(offer.price)}`,
            { type: 'acceptOffer', listingId: listing.id, offerId: offer.id }, 'chat-sale:' + threadId, true);
          const form = element('form', 'stage5__form');
          const input = element('input', 'stage5__price');
          input.type = 'text';
          input.maxLength = 300;
          input.required = true;
          input.placeholder = 'Например, «Можете дать 2 200?»';
          input.dataset.screenFocus = 'chat-input:' + threadId;
          const label = element('label', '', 'Сообщение покупателю');
          label.append(input);
          const sendButton = element('button', buttonClass, 'Отправить');
          sendButton.type = 'submit';
          form.append(label, sendButton);
          form.addEventListener('submit', (event) => {
            event.preventDefault();
            input.focus();
            send({ type: 'messageBuyer', listingId: listing.id, offerId: offer.id, text: input.value });
          });
          card.append(form, accept);
        }
        summary.addEventListener('click', (event) => {
          if (!card.open && offer.unread) {
            event.preventDefault();
            summary.focus({ preventScroll: true });
            send({ type: 'readOffer', listingId: listing.id, offerId: offer.id });
          }
        });
        cards.append(card);
      }
    }
    if (!cards.childElementCount) cards.append(element('p', 'stage5__copy', 'Сообщений пока нет. Выставите вещь на доске объявлений.'));
  }

  const reviews = view.reviews ?? [];
  if (reviews.length) {
    const rating = element('details', 'garage__panel market-rating');
    const average = reviews.reduce((sum, review) => sum + review.stars, 0) / reviews.length;
    rating.append(element('summary', '', `Рейтинг продавца · ${average.toFixed(1).replace('.', ',')} из 5`));
    for (const review of reviews.slice(-5).reverse()) {
      rating.append(element('p', '', `${review.buyer} · ${review.stars}/5 · ${review.item}. ${review.text}`));
    }
    screen.append(rating);
  }
  screen.append(cards);
}
