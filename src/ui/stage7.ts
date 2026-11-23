import { familyOccasion } from '../game/stage7-family';
import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import { actionButton, bankFor, element, replaceScreen, rubles } from './dom';
import { mountStage5 } from './mount';
import { relationshipGoalFor } from './relationship';
import { mountPaidVisit } from './stage7-trip';
import './stage7.css';

const periodNames = { morning: 'утро', afternoon: 'день', evening: 'вечер', night: 'ночь' } as const;
const primary = 'garage__button garage__button--primary';

function boxContents(view: Stage7View, dispatch: Stage7Dispatch, canUnpack = false): HTMLElement {
  const { flea, screen } = view;
  const panel = element('section', 'garage__panel stage7__box');
  panel.append(element('h2', 'garage__heading', 'Коробка для барахолки'),
    element('p', 'hub__detail', `Занято ${flea.used} из ${flea.limit} мест`));
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
  panel.append(element('h2', 'garage__heading', familyOccasion), element('p', 'hub__detail', `Отношение · ${affection}`));
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

export function mountStage7(root: HTMLElement, view: Stage7View, dispatch: Stage7Dispatch, animateVisit = false): void {
  const { screen, calendar, flea, paidVisit } = view;
  const expectedRevision = screen.revision;
  if (paidVisit?.open) {
    mountPaidVisit(root, paidVisit.record, {
      bank: screen.bank, revision: screen.revision, calendar, relationship: screen.phase === 'relationship',
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
    night.append(header, sky, actionButton('Проснуться', primary, () => dispatch({ type: 'wakeUp', expectedRevision })));
    replaceScreen(root, night, title);
    return;
  }

  if (flea.visit) {
    mountFleaVisit(root, view, dispatch);
    return;
  }

  mountStage5(root, screen, dispatch, calendar, { data: flea, dispatch });
  if (screen.phase === 'opening') return;
  const panel = element('section', 'garage__panel stage7__calendar');
  panel.setAttribute('aria-label', 'Игровой календарь');
  const summary = element('div', 'stage7__summary');
  summary.append(
    element('strong', '', `${calendar.weekday}, день ${calendar.day} · ${periodNames[calendar.period]}`),
    element('p', 'hub__detail', `Выезды до вечера · ${calendar.remainingOutings}`),
  );
  panel.append(summary);
  if (screen.phase === 'home') {
    const { weekday, daysAway } = calendar.nextMarket;
    const when = daysAway === 0 ? 'сегодня утром' : `${weekday.toLowerCase()}, утром`;
    summary.append(element('p', 'hub__detail', `В календаре · барахолка, ${when}`));
    if (flea.canVisit) panel.append(actionButton('На барахолку', primary,
      () => dispatch({ type: 'openFleaVisit', expectedRevision })));
    else if (daysAway === 0) summary.append(element('p', 'hub__detail', 'Сложи вещи для барахолки в гараже.'));
    if (paidVisit) panel.append(actionButton('Фото последней поездки', 'garage__button',
      () => dispatch({ type: 'openVisitPhoto', expectedRevision })));
    if (calendar.outing) {
      const until = calendar.period === 'morning' ? 'дня' : 'вечера';
      panel.append(actionButton(`Подождать до ${until}`, 'garage__button',
        () => dispatch({ type: 'waitUntilNextPeriod', expectedRevision })));
    } else {
      panel.append(actionButton('Лечь спать', primary, () => dispatch({ type: 'sleep', expectedRevision })));
    }
  }
  root.querySelector(':scope > .garage > .garage__header')?.after(panel);
  const datePanel = familyDatePanel(view, dispatch);
  if (datePanel) panel.after(datePanel);
  if (screen.phase === 'garage' || screen.phase === 'cargo' && screen.baggage) {
    panel.after(boxContents(view, dispatch, screen.phase === 'garage'));
  }
}
