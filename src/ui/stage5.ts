import type { Capacity, GarageItemView, Stage5Command, Stage5Dispatch, Stage5View } from '../game/stage5-contract';
import { breakageChance, marketOffers } from '../game/market-dialogue';
import type { roomNames } from '../game/stage5-contract';
import type { FleaView, Stage7Dispatch } from '../game/stage7-engine';
import door from './assets/story-door.jpg';
import rain from './assets/story-rain.jpg';
import keys from './assets/story-keys-zhiguli.jpg';
import { placeProp, sceneSprite, stackedBoxes } from './scene-sprites';
import './object-scenes.css';
import bar from './assets/stage5-bar.jpg';
import garage from './assets/stage5-garage.jpg';
import { placeGarageItems } from './garage-layout';
import { sellerProfile } from './seller-profile';
import courier from './assets/stage6-courier.jpg';
import caseClosed from './assets/stage6-suitcase-closed.png';
import caseOpen from './assets/stage6-suitcase-open.png';
import travelKit from './assets/stage6-travel-kit.png';
import travelSpeaker from './assets/stage6-travel-speaker.png';
import travelCamera from './assets/stage6-travel-camera.png';
import { actionButton, addFact, bankFor, element, replaceScreen, rubles } from './dom';
import { garageScenes } from './garage-scenes';
import { personalCarPicture, vehicleName, vehiclePicture } from './vehicle';
import { parkedPhoto, yards } from './yards';
import { yardHotspot } from './yard-hotspots';
import { houseLevel } from '../game/houses';
import { personalCars } from '../game/personal-cars';
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

const roomLabels = { home: 'Двор / Главная', garage: 'Мой гараж', market: 'Доска объявлений', inbox: 'Доска объявлений', car: 'Мой транспорт' } as const;
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

  const screen = element('section', view.phase === 'home' ? 'garage stage5 stage5--home' : 'garage stage5');
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
    if (view.frame === 'keys' && view.vehicle?.model === 'scooter') {
      panel.prepend(element('p', 'stage5__copy', 'Старые Жигули нужно поставить на ход. На первые торги поедешь на своём курьерском электроскутере.'));
    }
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
          : view.baggage ? 'В гараж' : item.tutorialDelivery ? 'Отправить в гараж бесплатно' : 'Забрать домой',
          { type: 'toggleCargo', itemId: item.id }, `cargo:${item.id}`, !item.selected);
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
        if (item.tutorialDelivery) details.append(element('p', 'hub__detail', 'Учебный вывоз не занимает место в сумке. В домашнем гараже велосипед займёт 4 места.'));
        if (item.selected) details.append(element('p', 'cargo-picked', item.tutorialDelivery ? 'Доставка выбрана'
          : view.baggage ? 'Выбрано для гаража' : 'Место в транспорте занято'));
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
    if (!view.baggage) panel.append(element('p', 'stage5__capacity', capacityLabel(view.vehicle ? vehicleName[view.vehicle.model] : 'Транспорт', view.car)));
    if (view.items.some(item => item.selected && item.tutorialDelivery)) {
      panel.append(element('p', 'hub__detail', 'Для велосипеда оформлен бесплатный вывоз.'));
    }
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
  const previous = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const previousKey = previous?.dataset.screenFocus;
  if (view.phase === 'market' && previous?.hasAttribute('data-market-edit') && previousKey) {
    const form = screen.querySelector(`[data-screen-focus="${CSS.escape(previousKey)}"]`);
    const details = form?.closest('details');
    if (details) details.open = true;
  }
  replaceScreen(root, screen, title);
  if (view.phase === 'market' && previousKey?.startsWith('publish:') && !previous?.hasAttribute('data-market-edit')) {
    screen.querySelector<HTMLElement>(`[data-screen-focus="${CSS.escape('listing:' + previousKey.slice(8))}"]`)?.focus();
  }
  if (view.phase === 'garage' && previousKey?.startsWith('repair:')) {
    const item = screen.querySelector<HTMLElement>(`[data-screen-focus="${CSS.escape('scene:' + previousKey.slice(7))}"]`);
    const overflow = item?.closest('details');
    if (overflow) overflow.open = true;
    item?.focus({ preventScroll: true });
  }
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
  const header = screen.querySelector('.garage__header')!;
  if (view.phase !== 'home') {
    header.prepend(button('Во двор', { type: 'navigate', room: 'home' }, 'home'));
  }

  if (view.phase === 'home') {
    const level = houseLevel(view.house, view.workshop, Boolean(view.homeImproved));
    const { image, alt } = yards[level];
    const photo = art(image, alt);
    const yardScene = element('div', 'yard-scene');
    yardScene.dataset.yardLevel = String(level);
    yardScene.append(photo);
    const house = yardHotspot(level, 'home');
    house.dataset.openHouseShowroom = '';
    const garage = yardHotspot(level, 'garage', () => send({ type: 'navigate', room: 'garage' }));
    garage.dataset.screenFocus = 'garage';
    yardScene.append(house, garage);
    const model = view.vehicle?.model ?? 'zhiguli';
    const restoring = model === 'scooter' && !view.personalCar;
    const leftParked = parkedPhoto(level, restoring ? 'scooter' : view.personalCar);
    const trailer = view.vehicle?.trailer;
    const rightModel = trailer != null ? `rig-${trailer}` : restoring ? 'zhiguli' : model;
    const rightParked = restoring || model !== 'scooter' ? parkedPhoto(level, rightModel) : undefined;
    yardScene.classList.toggle('yard-scene--rig', trailer != null);
    if (leftParked) yardScene.style.setProperty('--left-bay', `url("${leftParked}")`);
    if (rightParked) yardScene.style.setProperty('--right-bay', `url("${rightParked}")`);
    const car = button('', { type: 'navigate', room: 'car' }, 'yard-car');
    car.className = 'yard-car';
    car.dataset.workCar = model;
    car.dataset.screenFocus = 'car';
    car.classList.toggle('yard-car--photographed', Boolean(restoring ? leftParked : rightParked));
    car.setAttribute('aria-label', `Осмотреть транспорт: ${vehicleName[model]}`);
    if (!car.classList.contains('yard-car--photographed')) car.append(vehiclePicture(model, trailer));
    car.append(element('span', '', model === 'scooter' ? 'Скутер' : 'Рабочая'));
    yardScene.append(car);
    if (view.personalCar) {
      const personal = element('button', 'yard-car yard-car--personal');
      personal.type = 'button';
      personal.dataset.openShowroom = 'personal';
      personal.dataset.personalCar = view.personalCar;
      personal.classList.toggle('yard-car--photographed', Boolean(leftParked));
      const name = personalCars.find(({ id }) => id === view.personalCar)!.name;
      personal.setAttribute('aria-label', `Личная машина: ${name}`);
      if (!leftParked) personal.append(personalCarPicture(view.personalCar));
      personal.append(element('span', '', 'Личная'));
      yardScene.append(personal);
    } else if (restoring) {
      const sedan = button('', { type: 'navigate', room: 'car' }, 'yard-restoration');
      sedan.className = 'yard-car yard-car--restore';
      sedan.classList.toggle('yard-car--photographed', Boolean(rightParked));
      sedan.setAttribute('aria-label', 'Жигули ждут ремонта. Посмотреть стоимость');
      if (!rightParked) sedan.append(vehiclePicture('zhiguli'));
      sedan.append(element('span', '', 'Жигули'));
      yardScene.append(sedan);
    }
    const hero = element('div', 'yard-hero');
    const footer = element('div', 'yard-footer');
    hero.style.setProperty('--yard-backdrop', `url("${image}")`);
    const auction = button('К торгам', { type: 'navigate', room: 'auctions' }, 'auctions', true);
    const gavel = element('i', 'auction-call__gavel yard-gavel');
    gavel.setAttribute('aria-hidden', 'true');
    auction.prepend(gavel);
    footer.append(auction);
    yardScene.append(footer);
    header.querySelector('.garage__title')?.after(element('p', 'yard-caption', 'Твоя база в деревне'));
    hero.append(header, yardScene);
    screen.append(hero);
  }
  if (view.phase === 'garage') renderGarage(screen, view, button, send, pack);
  if (view.phase === 'car' && view.vehicle) {
    const panel = element('div', 'vehicle-tuning');
    for (const offer of view.vehicle.model === 'heavy' ? view.transportOffers ?? [] : []) {
      if (offer.id === 'highSideTrailer' || offer.id === 'containerTrailer') continue;
      const section = element('section', 'vehicle-upgrade');
      const remainder = view.bank - offer.price;
      section.append(element('h2', 'garage__heading', offer.label),
        element('p', 'hub__detail', `Мест для груза: ${offer.capacity} · до ${offer.auctions} аукционов в день`),
        element('p', 'hub__detail', remainder < 0 ? `Не хватает ${rubles(-remainder)}` : `Останется ${rubles(remainder)}`));
      if (offer.blocked) section.append(element('p', 'hub__reason', offer.blocked));
      const buy = button(`Подтвердить за ${rubles(offer.price)}`, { type: 'upgradeTransport', upgrade: offer.id }, `upgrade:${offer.id}`, true);
      buy.disabled = remainder < 0 || offer.blocked !== null;
      section.append(buy);
      panel.append(section);
    }
    if (panel.childElementCount) screen.append(panel);
  }
  if (view.phase === 'market' || view.phase === 'inbox') renderMarket(screen, view, button, send);

  if (view.phase !== 'home' && (view.lastSale || view.lastDeal || view.deals.length)) {
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
  const storage = element('section', 'garage-storage');
  storage.append(element('p', 'stage5__capacity', capacityLabel('Гараж', view.garage)));
  if (view.jewelry) storage.append(element('p', 'stage5__capacity', capacityLabel('Шкатулка', view.jewelry)));
  const upgrade = view.upgrades?.find(({ target }) => target === 'garage' || target === 'shelves');
  if (upgrade) {
    const details = element('details', 'garage-storage__upgrade');
    const buy = button(`Подтвердить за ${rubles(upgrade.price)}`, { type: 'buyCapacity', target: upgrade.target }, `upgrade:${upgrade.target}`, true);
    buy.disabled = !upgrade.available;
    details.append(element('summary', '', upgrade.target === 'shelves' ? 'Поставить второй стеллаж' : 'Поставить стеллаж'), element('p', 'hub__detail',
      `${upgrade.current} → ${upgrade.next} мест · ${rubles(upgrade.price)}`), buy);
    storage.append(details);
  }
  const scene = element('section', 'shelf-scene');
  scene.style.backgroundImage = `url("${garage}")`;
  scene.setAttribute('aria-label', 'Вещи в гараже');
  const level = houseLevel(view.house, view.workshop, Boolean(view.homeImproved));
  const interiors = ['Бабушкин гараж', 'Домашняя кладовая', 'Ремонтная мастерская', 'Гараж с галереей', 'Коллекционное хранилище'] as const;
  const plaque = element('span', 'garage-plaque', interiors[level - 1]);
  scene.append(plaque);
  const dialog = element('dialog', 'object-dialog');
  dialog.setAttribute('aria-labelledby', 'owned-item-title');
  const details = element('section', 'garage__panel');
  const inspector = element('aside', 'garage-inspector');

  function inspect(item: GarageItemView, source: HTMLElement): void {
    const graphic = sceneSprite(item.name);
    const publish = actionButton('К объявлению', primaryClass, () => {
      dialog.close();
      send({ type: 'navigate', room: 'market' });
      const price = document.getElementById('price-' + item.id);
      for (let details = price?.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
      price?.focus();
    });
    const heading = element('h2', 'garage__heading', item.name);
    heading.id = 'owned-item-title';
    const docked = matchMedia('(min-width: 900px)').matches;
    const close = actionButton('Закрыть', buttonClass, () => dialog.close());
    const discard = element('details', 'stage5__confirm');
    discard.append(element('summary', '', 'Освободить место'),
      button(`Подтвердить отказ: ${item.name}`, { type: 'discardItem', itemId: item.id }, `discard:${item.id}`));
    details.replaceChildren(heading);
    if (graphic) details.append(graphic);
    details.append(element('p', 'stage5__copy', item.clue), itemFacts(item), publish, discard);
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
    if (docked) inspector.replaceChildren(details);
    else {
      details.append(close);
      dialog.replaceChildren(details);
      dialog.addEventListener('close', () => source.focus({ preventScroll: true }), { once: true });
      dialog.showModal();
      close.focus();
    }
  }

  dialog.append(details);
  const overflow = placeGarageItems(scene, view.items, Number(view.garage.limit >= 16) + Number(view.garage.limit >= 24), inspect, level);
  const tray = element('div', 'garage-tray');
  for (const item of view.items.slice(0, 3)) {
    const picture = sceneSprite(item.name);
    const pick = actionButton(picture ? '' : item.name, 'garage-tray__pick', () => inspect(item, pick));
    pick.setAttribute('aria-label', 'Карточка: ' + item.name);
    pick.title = item.name;
    if (picture) pick.append(picture);
    tray.append(pick);
  }
  scene.append(tray);
  if (!view.items.length) scene.append(element('p', 'garage__panel', 'Гараж пуст. Новые находки можно привезти с торгов.'));
  const workspace = element('div', 'garage-workspace');
  workspace.append(scene, inspector);
  screen.append(workspace, overflow, storage);
  if (view.items[0] && matchMedia('(min-width: 900px)').matches) inspect(view.items[0], scene);
  screen.append(dialog);
}

function renderMarket(screen: HTMLElement, view: RoomView, button: Control, send: (action: Action) => void): void {
  screen.classList.add('market-room');
  const tabs = element('nav', 'market-tabs');
  tabs.setAttribute('aria-label', 'Разделы доски объявлений');
  const inboxLabel = 'Сообщения покупателей';
  const listingsTab = button('Мои объявления', { type: 'navigate', room: 'market' }, 'market', view.phase === 'market');
  const messagesTab = button(inboxLabel, { type: 'navigate', room: 'inbox' }, 'inbox', view.phase === 'inbox');
  if (view.unread) messagesTab.append(element('span', 'market-unread', String(view.unread)));
  const selected = view.phase === 'market' ? listingsTab : messagesTab;
  selected.setAttribute('aria-current', 'page');
  const body = element('div', 'market-content');
  const profile = element('section', 'garage__panel market-profile');
  profile.hidden = true;
  const profileTab = actionButton('Профиль продавца', buttonClass, () => showProfile(true));
  function showProfile(open: boolean): void {
    body.hidden = open;
    profile.hidden = !open;
    selected.classList.toggle('garage__button--primary', !open);
    if (open) selected.removeAttribute('aria-current');
    else selected.setAttribute('aria-current', 'page');
    profileTab.classList.toggle('garage__button--primary', open);
    if (open) profileTab.setAttribute('aria-current', 'page');
    else profileTab.removeAttribute('aria-current');
  }
  selected.addEventListener('click', () => showProfile(false));
  tabs.append(listingsTab, messagesTab, profileTab);
  screen.append(tabs);
  const help = element('details', 'sales-help');
  const steps = element('ol', '');
  for (const text of [
    'В гараже выбери вещь и нажми «К объявлению». Сверься с оценкой и назначь цену.',
    'В «Сообщениях» открой диалог. Можно принять предложение, написать встречную цену или вернуться к разговору позже.',
    'Деньги поступают в банк после подтверждения продажи. Остальные диалоги об этой вещи закрываются.',
    `Если вещь работает, покупатель ставит 4 или 5 звёзд. Оценка от 1 до 3 возможна при поломке. Риск с износом — ${breakageChance.worn}%, если вещь требует ремонта — ${breakageChance.damaged}%. Ремонт убирает риск.`,
  ]) steps.append(element('li', '', text));
  help.append(element('summary', '', 'Как продавать?'), steps);
  body.append(help);
  const cards = element('div', 'stage5__market');
  if (view.phase === 'market') {
    const drafts = element('details', 'market-drafts');
    const draftList = element('div', 'stage5__market');
    drafts.append(element('summary', '', '＋ Опубликовать объявление'), draftList);
    const filter = element('fieldset', 'market-filter');
    filter.append(element('legend', '', 'Фильтры'));
    const category = element('select', '');
    for (const [value, title] of [['all', 'Все категории'], ['item', 'Находки'], ['vehicle', 'Транспорт']] as const) {
      const option = element('option', '', title);
      option.value = value;
      category.append(option);
    }
    const categoryLabel = element('label', '', 'Категория');
    categoryLabel.append(category);
    filter.append(categoryLabel);
    const prices = element('div', 'market-filter__prices');
    function priceBound(title: string) {
      const label = element('label', '', title);
      const input = element('input', '');
      input.type = 'number';
      input.min = '0';
      input.placeholder = '₽';
      label.append(input);
      prices.append(label);
      return input;
    }
    const min = priceBound('Цена от');
    const max = priceBound('До');
    filter.append(prices, element('strong', '', 'Состояние'));
    let condition = 'all';
    const noMatches = element('p', '', 'По этим условиям ничего нет.');
    noMatches.hidden = true;
    function applyFilters() {
      let count = 0;
      for (const card of body.querySelectorAll<HTMLElement>('.market-card')) {
        const price = Number(card.dataset.price);
        card.hidden = (category.value !== 'all' && (card.dataset.category ?? 'item') !== category.value)
          || (condition !== 'all' && card.dataset.condition !== condition)
          || price < (min.valueAsNumber || 0) || (max.value !== '' && price > max.valueAsNumber);
        if (!card.hidden) count++;
      }
      noMatches.hidden = count > 0;
    }
    for (const [key, name] of [['all', 'Любое'], ...Object.entries(conditions)]) {
      const label = element('label', '');
      const radio = element('input', '');
      radio.type = 'radio';
      radio.name = 'market-condition';
      radio.checked = key === 'all';
      radio.addEventListener('change', () => { condition = key!; applyFilters(); });
      label.append(radio, name!);
      filter.append(label);
    }
    filter.append(actionButton('Применить', buttonClass, applyFilters));
    body.prepend(filter, noMatches);
    const publishTab = actionButton('＋ Опубликовать', primaryClass, () => {
      showProfile(false);
      drafts.open = true;
      drafts.scrollIntoView({ block: 'nearest' });
      const first = drafts.querySelector<HTMLDetailsElement>('.market-card:not([hidden]) details');
      if (first) { first.open = true; first.querySelector('input')?.focus(); }
    });
    publishTab.disabled = !view.items.some(item => !view.listings.some(listing => listing.itemId === item.id));
    tabs.append(publishTab);
    for (const item of view.items) {
      const listing = view.listings.find(({ itemId }) => itemId === item.id);
      const card = element('article', 'garage__panel market-card');
      card.dataset.condition = item.condition;
      card.dataset.price = String(listing?.price ?? Math.round((item.estimate.min + item.estimate.max) / 2));
      const overview = element('div', 'market-card__overview');
      const picture = sceneSprite(item.name);
      if (picture) overview.append(picture);
      const copy = element('div', 'market-card__copy');
      const heading = element('h2', 'garage__heading', item.name);
      if (listing) {
        heading.tabIndex = -1;
        heading.dataset.screenFocus = 'listing:' + item.id;
      }
      copy.append(heading, element('p', 'market-description', item.clue), element('p', 'market-condition', conditions[item.condition]));
      if (listing) {
        const offers = marketOffers(listing).filter(({ closed }) => !closed);
        const best = offers.reduce((max, offer) => Math.max(max, offer.price), 0);
        copy.append(element('strong', 'market-price', rubles(listing.price)),
          element('p', '', offers.length ? `Откликов · ${offers.length} · лучшая цена ${rubles(best)}` : 'Ждём покупателя'));
      }
      overview.append(copy);
      card.append(overview);
      const details = element('details', 'market-card__details');
      details.append(element('summary', '', listing ? 'Подробнее и редактирование' : 'Подробнее'), itemFacts(item));
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
      if (listing) publish.dataset.marketEdit = '';
      publish.setAttribute('aria-label', `${publish.textContent}: ${item.name}`);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        send({ type: 'publish', itemId: item.id, price: price.valueAsNumber });
      });
      form.append(label, publish);
      form.append(element('small', 'market-price-tip', `Оценка ${rubles(item.estimate.min)}–${rubles(item.estimate.max)}`));
      if (listing) {
        details.append(form, button('Снять объявление', { type: 'cancelListing', listingId: listing.id }, `cancel:${listing.id}`));
        if (marketOffers(listing).some(({ closed }) => !closed)) {
          card.append(actionButton('К сообщениям', buttonClass, () => {
            const root = screen.parentElement;
            send({ type: 'navigate', room: 'inbox' });
            root?.querySelector<HTMLElement>(
              `[data-sale-item="${CSS.escape(item.id)}"][data-active-offer] .market-thread__summary`,
            )?.click();
          }));
        }
        card.append(details);
        cards.append(card);
      } else {
        copy.append(element('strong', 'market-price', rubles(Number(card.dataset.price))));
        details.querySelector('summary')!.textContent = 'Назначить цену';
        details.append(form);
        card.append(details);
        draftList.append(card);
      }
    }
    if (!cards.childElementCount) cards.append(element('p', 'stage5__copy', 'Активных объявлений пока нет.'));
    if (draftList.childElementCount) {
      drafts.open = !view.listings.length;
      help.after(drafts);
    } else if (!view.items.length) help.after(element('p', 'stage5__copy', 'Пока нечего выставить. Привези находку с торгов.'));
  } else {
    const list = element('div', 'market-thread-list');
    list.setAttribute('aria-label', 'Диалоги покупателей');
    const selection = new URL(location.href).searchParams.get('buyer');
    const chatArea = element('div', 'market-chat-area');
    function openThread(id: string | null): void {
      const url = new URL(location.href);
      if (id) url.searchParams.set('buyer', id);
      else url.searchParams.delete('buyer');
      if (url.href !== location.href) history.replaceState(history.state, '', url);
      for (const thread of chatArea.querySelectorAll<HTMLElement>('[data-thread]')) thread.hidden = thread.dataset.thread !== id;
      for (const row of list.querySelectorAll<HTMLButtonElement>('[data-thread]')) {
        row.setAttribute('aria-pressed', String(row.dataset.thread === id));
      }
    }
    for (const listing of view.listings) {
      const item = view.items.find(({ id }) => id === listing.itemId);
      if (!item) continue;
      for (const offer of marketOffers(listing)) {
        const card = element('section', 'garage__panel market-chat');
        const threadId = offer.id.split('@')[0]!;
        card.dataset.thread = threadId;
        card.dataset.saleItem = item.id;
        card.hidden = selection !== threadId;
        const row = element('div', 'market-thread');
        row.dataset.saleItem = item.id;
        if (!offer.closed) row.dataset.activeOffer = '';
        const summary = actionButton('', 'market-thread__summary', () => {
          openThread(threadId);
          if (offer.unread && !offer.closed) {
            const root = screen.parentElement;
            send({ type: 'readOffer', listingId: listing.id, offerId: offer.id });
            root?.querySelector<HTMLElement>(`[data-screen-focus="${CSS.escape('chat-title:' + threadId)}"]`)?.focus();
          } else title.focus();
        });
        summary.dataset.thread = threadId;
        summary.setAttribute('aria-pressed', String(!card.hidden));
        const picture = sceneSprite(item.name);
        if (picture) summary.append(picture);
        const identity = element('span', 'market-thread__identity');
        identity.append(element('strong', '', offer.buyer), element('span', '', item.name));
        const status = offer.closed ? 'Диалог закрыт' : rubles(offer.price);
        identity.append(element('small', '', `${status}${offer.unread && !offer.closed ? ' · новое' : ''}`));
        summary.append(identity);
        summary.dataset.screenFocus = 'chat:' + threadId;
        row.append(summary);
        const title = element('h2', 'garage__heading', offer.buyer);
        title.tabIndex = -1;
        title.dataset.screenFocus = 'chat-title:' + threadId;
        const back = actionButton('К диалогам', buttonClass, () => {
          openThread(null);
          summary.focus({ preventScroll: true });
        });
        const header = element('header', 'market-chat__header');
        header.append(back, title, element('p', 'hub__detail', `${item.name} · объявление за ${rubles(listing.price)}`));
        card.append(header);
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
        list.append(row);
        chatArea.append(card);
      }
    }
    if (list.childElementCount) {
      cards.classList.add('market-conversations');
      cards.append(list, chatArea);
    } else cards.append(element('p', 'stage5__copy', 'Сообщений пока нет. Выстави вещь на доске объявлений.'));
    if (selection && !Array.from(chatArea.children).some(thread => (thread as HTMLElement).dataset.thread === selection)) openThread(null);
  }

  const reviews = view.reviews ?? [];
  profile.append(sellerProfile(reviews));
  if (view.lastSale) profile.append(element('p', '', `Последняя продажа · ${view.lastSale.name} · ${rubles(view.lastSale.price)}`));
  body.append(cards);
  screen.append(body, profile);
}
