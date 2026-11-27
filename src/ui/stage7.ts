import { familyOccasion } from '../game/stage7-family';
import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import { outingAvailable, periodNames, waitLabels } from '../game/stage7-calendar';
import { mountOwnedTransport } from './owned-transport';
import { actionButton, bankFor, element, replaceScreen, rubles } from './dom';
import { mountStage5 } from './mount';
import { relationshipGoalFor } from './relationship';
import { mountPaidVisit } from './stage7-trip';
import { personalCarPicture, vehicleName, vehiclePicture } from './vehicle';
import { mountLife } from './life';
import './stage7.css';

const primary = 'garage__button garage__button--primary';

function boxContents(view: Stage7View, dispatch: Stage7Dispatch, canUnpack = false): HTMLElement {
  const { flea, screen } = view;
  const panel = element('section', 'garage__panel stage7__box');
  panel.append(element('h2', 'garage__heading', 'Коробка для барахолки'),
    element('p', 'hub__detail', `Занято ${flea.used} из ${flea.limit} мест · свободно ${flea.limit - flea.used}`));
  const pending = screen.phase === 'cargo' && screen.baggage
    ? screen.items.filter(({ id }) => flea.packing.some((item) => item.id === id && item.selected)) : [];
  if (!flea.items.length && !pending.length) panel.append(element('p', 'hub__detail', 'В коробке пока пусто.'));
  else {
    const items = element('ul', 'stage7__box-items');
    for (const item of flea.items) {
      const row = element('li', 'stage7__box-row');
      const { min, max } = item.estimate;
      row.append(element('span', '', `${item.name} · оценка ${min === max ? rubles(min) : `${rubles(min)}–${rubles(max)}`}`));
      if (canUnpack) {
        const button = actionButton('Вернуть в гараж', 'garage__button',
          () => dispatch({ type: 'unpackFlea', expectedRevision: screen.revision, itemId: item.id }));
        button.setAttribute('aria-label', `Вернуть в гараж: ${item.name}`);
        button.disabled = !item.canReturn;
        row.append(button);
        if (!item.canReturn) row.append(element('span', 'hub__detail', 'Место хранения заполнено.'));
      }
      items.append(row);
    }
    for (const item of pending) items.append(element('li', '', `${item.name} · после сохранения находок`));
    panel.append(items);
  }
  return panel;
}

function mountFleaVisit(root: HTMLElement, view: Stage7View, dispatch: Stage7Dispatch): void {
  const { flea, screen, calendar } = view;
  const visit = flea.visit!;
  const page = element('section', 'garage');
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', visit.phase === 'offer' ? 'Поездка на барахолку' : 'Квитанция барахолки');
  title.tabIndex = -1;
  header.append(title, bankFor(screen.bank));
  page.append(header);

  if (visit.phase === 'offer') {
    page.append(element('p', 'hub__detail', `${calendar.weekday} · поездка займёт утренний выезд.`), boxContents(view, dispatch));
    const actions = element('div', 'garage__controls');
    actions.append(actionButton('Поехать утром', primary, () => dispatch({ type: 'confirmFleaVisit', expectedRevision: screen.revision })),
      actionButton('Отменить поездку', 'garage__button', () => dispatch({ type: 'cancelFleaVisit', expectedRevision: screen.revision })));
    page.append(actions);
  } else {
    const report = element('section', 'garage__panel stage7__box');
    report.append(element('h2', 'garage__heading', `Выручка · ${rubles(visit.revenue)}`));
    if (visit.sold.length) {
      const sold = element('ul', 'stage7__box-items');
      for (const item of visit.sold) sold.append(element('li', '', `${item.name} · ${rubles(item.price)}`));
      report.append(sold);
    } else report.append(element('p', 'hub__detail', 'Покупателей сегодня не нашлось.'));
    page.append(report, boxContents(view, dispatch), element('p', 'hub__detail', 'Дневной выезд доступен.'),
      actionButton('Вернуться домой', primary, () => dispatch({ type: 'closeFleaReceipt', expectedRevision: screen.revision })));
  }
  replaceScreen(root, page, title);
}

function familyDatePanel(view: Stage7View, dispatch: Stage7Dispatch): HTMLElement | null {
  const { screen, calendar, familyDate: date } = view;
  if (!date || (screen.phase !== 'home' && screen.phase !== 'relationship')) return null;
  const expectedRevision = screen.revision;
  const panel = element('section', 'garage__panel stage7__box');
  panel.setAttribute('aria-label', 'Семейная дата');
  const affection = date.affection > 0 ? `+${date.affection}` : date.affection < 0 ? '−1' : '0';
  panel.append(element('h2', 'garage__heading', familyOccasion), element('p', 'hub__detail', `Реакция на семейную дату · ${affection}`));
  if (date.outcome === 'pending') {
    const daysAway = date.day - calendar.day;
    const when = daysAway === 0 ? 'Сегодня' : daysAway === 1 ? 'Завтра, в воскресенье' : 'В воскресенье';
    panel.append(element('p', 'hub__detail', `${when} · день ${date.day}`),
      element('p', 'hub__detail', `Букет за ${rubles(date.price)} · отношение +1 при поздравлении, −1 при пропуске`));
    if (date.advancesStory) panel.append(element('p', 'hub__detail', 'Этот же букет продвинет историю к приглашению в кино.'));
    if (daysAway === 0) {
      if (screen.bank < date.price) panel.append(element('p', 'hub__reason', `Не хватает ${rubles(date.price - screen.bank)}.`));
      if (screen.bank >= date.price && (screen.phase === 'home' || !date.advancesStory)) {
        panel.append(actionButton(`Поздравить с цветами за ${rubles(date.price)}`, primary,
          () => dispatch({ type: 'giveBirthdayFlowers', expectedRevision })));
      }
    }
  } else if (date.outcome === 'celebrated') {
    panel.append(element('p', 'stage5__copy', '«Спасибо за цветы. Мне приятно, что ты вспомнил!»'));
  } else {
    panel.append(element('p', 'stage5__copy', '«В день рождения я ждала, что ты заглянешь».'));
  }
  if (screen.phase === 'home') {
    if (date.nextGoal) panel.append(element('h3', 'hub__name', 'Следующий шаг истории'),
      relationshipGoalFor(date.nextGoal, date.status, screen.bank));
    panel.append(actionButton(date.step === 'movedIn' ? 'Открыть эпилог' : 'К истории с соседями', 'garage__button',
      () => dispatch({ type: 'openRelationship', expectedRevision })));
  }
  return panel;
}

export function mountStage7(root: HTMLElement, view: Stage7View, dispatch: Stage7Dispatch, animateVisit = false,
  watchJobAd?: (revision: number) => void): void {
  const { screen, calendar, flea, paidVisit } = view;
  const lifeFocus = root.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.lifeFocus : undefined;
  const expectedRevision = screen.revision;
  if (screen.phase === 'job' && !view.jobUnlocked) {
    const page = element('section', 'garage');
    const header = element('header', 'garage__header');
    const title = element('h1', 'garage__title', 'Подработка в гараже');
    title.tabIndex = -1;
    header.append(title, bankFor(screen.bank));
    const panel = element('section', 'garage__panel');
    panel.append(element('p', '', `Оплата за сортировку — ${rubles(screen.reward)}. Для доступа к заказу посмотрите видео.`));
    if (watchJobAd) panel.append(actionButton('Посмотреть рекламу', primary, () => watchJobAd(screen.revision)));
    panel.append(actionButton('Вернуться домой', 'garage__button', () => dispatch({ type: 'navigate', room: 'home', expectedRevision })));
    page.append(header, panel);
    replaceScreen(root, page, title);
    return;
  }
  const returningToRest = screen.phase === 'home' && root.contains(document.activeElement)
    && document.activeElement?.getAttribute('data-screen-focus') === 'rest';
  if (paidVisit?.open) {
    mountPaidVisit(root, paidVisit.record, {
      bank: screen.bank, revision: screen.revision, calendar, relationship: screen.phase === 'relationship',
      vehicle: view.vehicle,
      ...(view.personalCar ? { personalCar: view.personalCar } : {}),
    }, dispatch, animateVisit);
    return;
  }
  if (calendar.period === 'night') {
    const night = element('section', 'garage');
    const header = element('header', 'garage__header');
    const title = element('h1', 'garage__title', 'Ночь дома');
    title.tabIndex = -1;
    header.append(title, bankFor(screen.bank));

    const sky = element('div', 'stage7__sky');
    sky.setAttribute('aria-hidden', 'true');
    sky.append(element('span', 'stage7__moon'), element('span', 'stage7__sun'));
    const wake = actionButton('Проснуться', primary, () => dispatch({ type: 'wakeUp', expectedRevision }));
    wake.dataset.screenFocus = 'wake-up';
    night.append(header, sky, wake);
    replaceScreen(root, night, title);
    return;
  }

  if (flea.visit) {
    mountFleaVisit(root, view, dispatch);
    return;
  }

  const boughtNow = screen.phase === 'cargo' && !screen.baggage
    && root.firstElementChild?.getAttribute('data-auction-lot') === String(screen.lotNumber);
  const previousTransport = root.querySelector<HTMLElement>('.owned-transport')?.dataset;
  const transportFocus = (document.activeElement as HTMLElement | null)?.dataset.transportFocus;
  mountStage5(root, screen, dispatch, calendar, { data: flea, dispatch });
  if (screen.phase === 'market' && view.showroom) {
    const vehicles = element('section', 'stage5__market market-vehicles');
    for (const car of [...view.showroom.work, ...view.showroom.personal].filter(car => car.owned)) {
      const card = element('article', 'garage__panel market-card');
      card.dataset.category = 'vehicle';
      card.dataset.price = String(car.resale);
      const overview = element('div', 'market-card__overview');
      const target = car.target;
      overview.append(target.category === 'work' ? vehiclePicture(target.model) : personalCarPicture(target.model));
      const copy = element('div', 'market-card__copy');
      copy.append(element('h2', 'garage__heading', car.name), element('p', 'market-description', car.classLabel),
        element('strong', 'market-price', rubles(car.resale)), element('p', '', 'Предложение выкупа'));
      overview.append(copy);
      card.append(overview);
      if (car.saleBlock) card.append(element('small', '', car.saleBlock));
      else {
        const confirm = element('details', 'market-card__details');
        confirm.append(element('summary', '', 'Продать транспорт'), actionButton('Подтвердить за ' + rubles(car.resale), primary,
          () => dispatch({ type: 'sellVehicle', target, expectedRevision })));
        card.append(confirm);
      }
      vehicles.append(card);
    }
    root.querySelector('.market-content > .stage5__market')?.before(vehicles);
  }
  if (screen.phase === 'car' && view.showroom) {
    mountOwnedTransport(root, view, dispatch, previousTransport, transportFocus);
  }
  if (screen.phase === 'home') {
    root.querySelector('.yard-hero > .garage__header')?.prepend(
      element('p', 'yard-clock', `День ${calendar.day} · ${periodNames[calendar.period]}`),
    );
  }
  if (view.auctionTransport) {
    const { garageFree, tutorialDelivery, longLoad } = view.auctionTransport;
    const transport = element('div', 'auction-transport');
    transport.append(vehiclePicture(view.vehicle.model, view.vehicle.trailer));
    const notes = element('div', '');
    notes.append(element('strong', '', vehicleName[view.vehicle.model]),
      element('p', '', `Мест в транспорте: ${view.vehicle.capacity} · свободно в гараже: ${garageFree}`));
    if (tutorialDelivery) notes.append(element('p', '', garageFree >= 4
      ? 'Для велосипеда доступен бесплатный вывоз в гараж.'
      : 'Бесплатный вывоз велосипеда требует 4 свободных мест в домашнем гараже.'));
    if (longLoad) notes.append(element('p', '', `Для находки «${longLoad}» понадобится пикап или фургон.`));
    transport.append(notes);
    root.querySelector('.auction-layout > .garage__panel')?.append(transport);
  }
  if (boughtNow) {
    const announcer = element('div', 'auction-call');
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-label', `Продано вам за ${rubles(screen.purchasePrice)}`);
    const count = element('span', 'auction-call__steps');
    count.setAttribute('aria-hidden', 'true');
    for (const word of ['Раз', 'Два', 'Три']) count.append(element('span', '', word));
    const sold = element('span', 'auction-call__sold', `Лот ваш · ${rubles(screen.purchasePrice)}`);
    sold.setAttribute('aria-hidden', 'true');
    sold.prepend(element('i', 'auction-call__gavel'));
    announcer.append(count, sold);
    root.querySelector('.stage5__close')?.append(announcer);
  }
  if (screen.phase === 'opening') return;
  const panel = element('section', 'garage__panel stage7__calendar');
  panel.setAttribute('aria-label', 'Игровой календарь');
  const summary = element('div', 'stage7__summary');
  summary.append(
    element('strong', '', `${calendar.weekday}, день ${calendar.day} · ${periodNames[calendar.period]}`),
    element('p', 'hub__detail', `Выезды до вечера · ${calendar.remainingOutings}`),
  );
  panel.append(summary);
  if (calendar.bonusAuction) summary.append(element('p', 'hub__detail', calendar.bonusAuction === 'available'
    ? 'Доступен вечерний аукцион' : 'Вечерний аукцион использован'));
  if (screen.phase === 'home') {
    const { weekday, daysAway } = calendar.nextMarket;
    const when = daysAway === 0 ? 'сегодня утром' : `${weekday.toLowerCase()}, утром`;
    summary.append(element('p', 'hub__detail', `В календаре · барахолка, ${when}`));
    if (flea.canVisit) panel.append(actionButton('На барахолку', primary,
      () => dispatch({ type: 'openFleaVisit', expectedRevision })));
    else if (daysAway === 0) summary.append(element('p', 'hub__detail', 'Сложи вещи для барахолки в гараже.'));
    if (paidVisit) panel.append(actionButton('Фото последней поездки', 'garage__button',
      () => dispatch({ type: 'openVisitPhoto', expectedRevision })));
    if (outingAvailable(calendar.period)) {
      panel.append(actionButton(`Подождать ${waitLabels[calendar.period]}`, 'garage__button',
        () => dispatch({ type: 'waitUntilNextPeriod', expectedRevision })));
    }
  }
  const scene = root.querySelector(':scope > .garage');
  if (['garage', 'home', 'inspection', 'bidding', 'relationship'].includes(screen.phase)) scene?.append(panel);
  else if (!['car', 'market', 'inbox'].includes(screen.phase)) scene?.querySelector('.garage__header')?.after(panel);
  if (view.canParkLot && screen.phase === 'cargo') {
    const action = actionButton('Отложить разбор и вернуться к торгам', 'garage__button',
      () => dispatch({ type: 'parkLot', expectedRevision }));
    scene?.querySelector('.stage5__layout > .stage5__stack:last-child')?.append(action);
  }
  if (view.parkedLots.length && ['home', 'garage', 'hub'].includes(screen.phase)) {
    const parked = element('section', 'garage__panel stage7__parked');
    parked.append(element('h2', 'garage__heading', 'Купленные гаражи'));
    for (const lot of view.parkedLots) {
      parked.append(actionButton(`Разобрать лот №${lot.lotNumber} · куплен за ${rubles(lot.purchasePrice)}`, 'garage__button',
        () => dispatch({ type: 'resumeLot', expectedRevision, lotNumber: lot.lotNumber })));
    }
    scene?.querySelector(screen.phase === 'home' ? '.yard-hero' : '.garage__header')?.after(parked);
  }
  if (calendar.period === 'evening' && ['home', 'garage', 'car', 'market', 'inbox', 'hub'].includes(screen.phase)) {
    const atHome = screen.phase === 'home';
    const rest = actionButton(atHome ? 'Лечь спать' : 'Домой отдыхать', primary, () => {
      dispatch(atHome ? { type: 'sleep', expectedRevision } : { type: 'navigate', room: 'home', expectedRevision });
    });
    rest.dataset.screenFocus = 'rest';
    const notice = element('section', 'garage__panel stage7__rest');
    const extraAuction = calendar.bonusAuction === 'available';
    notice.append(element('h2', '', extraAuction ? 'Вечерний аукцион или отдых' : 'Пора отдохнуть'),
      element('p', '', extraAuction ? 'На улучшенном пикапе можно успеть на ещё одни торги.'
        : 'Герой устал. После сна снова будут доступны выезды.'), rest);
    const auctionLink = scene?.querySelector('[data-screen-focus="auctions"]');
    if (!extraAuction && auctionLink instanceof HTMLButtonElement) {
      auctionLink.disabled = true;
      auctionLink.textContent = 'Торги завтра';
    }
    if (atHome) scene?.querySelector('.yard-hero')?.after(notice);
    else scene?.querySelector('.garage__header')?.after(notice);
    if (returningToRest) rest.focus({ preventScroll: true });
  }
  const datePanel = familyDatePanel(view, dispatch);
  if (datePanel) panel.after(datePanel);
  if (screen.phase === 'garage' || screen.phase === 'cargo' && screen.baggage) {
    panel.after(boxContents(view, dispatch, screen.phase === 'garage'));
  }
  mountLife(root, view, dispatch, lifeFocus);
}
