import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import type { ShowroomTarget } from '../game/showroom';
import { trailerNames } from '../game/transport';
import { actionButton, addFact, bankFor, element, rubles } from './dom';
import { personalCarPicture, vehiclePicture } from './vehicle';
import './showroom.css';

const buttonClass = 'garage__button';
const primary = buttonClass + ' garage__button--primary';
type Category = ShowroomTarget['category'];
type Card = NonNullable<Stage7View['showroom']>[Category][number];

export function createShowroom(root: HTMLElement, dispatch: Stage7Dispatch) {
  const dialog = element('dialog', 'showroom');
  dialog.setAttribute('aria-labelledby', 'showroom-title');
  root.after(dialog);
  let view: Stage7View | undefined;
  let category: Category = 'work';
  const index: Record<Category, number> = { work: 0, personal: 0 };
  let confirm: 'full' | 'trade' | null = null;
  let origin: HTMLElement | null = null;
  let errorMessage = '';

  function render(focus?: string) {
    const catalog = view?.showroom;
    if (!view || !catalog) return;
    const list = catalog[category];
    const card = list[index[category]]!;
    const active = list.find(entry => entry.active);
    const revision = view.screen.revision;
    function button(label: string, key: string, action: () => void, emphasized = false) {
      const control = actionButton(label, emphasized ? primary : buttonClass, action);
      control.dataset.showroomFocus = key;
      return control;
    }
    const title = element('h1', 'garage__title', 'Автосалон');
    title.id = 'showroom-title';
    const header = element('header', 'showroom__header');
    header.append(button('Назад', 'close', () => dialog.close()), title, bankFor(view.screen.bank));
    const tabs = element('nav', 'showroom__tabs');
    tabs.setAttribute('aria-label', 'Категория транспорта');
    for (const [key, label] of [['work', 'Рабочий'], ['personal', 'Личный']] as const) {
      const tab = button(label, key, () => {
        category = key;
        confirm = null;
        render(key);
      }, category === key);
      tab.setAttribute('aria-pressed', String(category === key));
      tabs.append(tab);
    }

    function step(delta: number, key: string) {
      index[category] = (index[category] + delta + list.length) % list.length;
      confirm = null;
      errorMessage = '';
      render(key);
    }
    const visual = element('section', 'showroom__visual');
    const model = element('div', 'showroom__model');
    if (card.target.category === 'personal') model.append(personalCarPicture(card.target.model));
    else if (card.vehicle) model.append(vehiclePicture(card.vehicle.model, card.vehicle.trailer));
    const controls = element('div', 'showroom__arrows');
    const previous = button('‹', 'previous', () => step(-1, 'previous'));
    previous.setAttribute('aria-label', 'Предыдущая модель');
    const next = button('›', 'next', () => step(1, 'next'));
    next.setAttribute('aria-label', 'Следующая модель');
    controls.append(previous, element('span', '', `${index[category] + 1} из ${list.length}`), next);
    visual.append(model, controls);

    const panel = element('section', 'garage__panel showroom__card');
    const heading = element('h2', 'garage__heading', card.name);
    heading.tabIndex = -1;
    heading.dataset.showroomFocus = 'model';
    const live = element('div', 'showroom__model-heading');
    live.setAttribute('aria-live', 'polite');
    live.append(heading, element('p', 'hub__detail', card.classLabel));
    const available = !card.blocked.length && (!card.fullMissing || card.tradeIn && !card.tradeMissing);
    panel.append(live, element('p', 'showroom__state', card.active ? 'Активна' : card.owned ? 'В собственности' :
      available ? 'Доступна' : 'Заблокирована'));
    const facts = element('dl', 'garage__facts');
    if (card.target.category === 'personal') {
      addFact(facts, 'Социальный рейтинг', `${catalog.status} / ${card.statusRequired}`);
      panel.append(element('p', 'hub__detail', 'Используется в поездках по городу.'));
    } else if (card.vehicle) {
      addFact(facts, 'Грузовых мест', String(card.vehicle.capacity));
      addFact(facts, 'Длинномер', card.bulky ? 'Поместится' : 'Не поместится');
      addFact(facts, 'До аукционов за день', String(card.auctions));
      if (card.vehicle.trailer !== undefined) addFact(facts, 'Прицеп', trailerNames[card.vehicle.trailer]);
    }
    panel.append(facts);
    if (card.owned) {
      if (!card.active) panel.append(button('Выбрать', 'activate', () => dispatch({
        type: 'activateVehicle', target: card.target, expectedRevision: revision,
      }), true));
      if (card.active && card.target.category === 'work' && card.target.model === 'heavy') {
        panel.append(button('К тюнингу', 'tuning', () => {
          dialog.close();
          if (view?.screen.phase !== 'car') dispatch({ type: 'navigate', room: 'car', expectedRevision: revision });
        }));
      }
    } else {
      const balance = view.screen.bank;
      const restoration = card.target.category === 'work' && card.target.model === 'zhiguli';
      panel.append(element('p', 'showroom__price', rubles(card.price)));
      for (const reason of card.blocked) panel.append(element('p', 'hub__reason', reason));
      const full = button(restoration ? 'Поставить Жигули на ход' : 'Купить за полную цену', 'full', () => {
        confirm = 'full';
        render('confirm');
      }, true);
      full.disabled = card.fullMissing > 0 || card.blocked.length > 0;
      panel.append(full);
      if (card.fullMissing) panel.append(element('p', 'hub__reason', `Для полной оплаты не хватает ${rubles(card.fullMissing)}.`));
      if (card.tradeIn) {
        const trade = button(`Сдать ${active?.name} в зачёт`, 'trade', () => {
          confirm = 'trade';
          render('confirm');
        });
        trade.disabled = card.tradeMissing > 0 || card.blocked.length > 0;
        panel.append(trade, element('p', 'hub__detail', `Зачёт ${rubles(card.tradeIn)} · доплата ${rubles(card.price - card.tradeIn)}`));
        if (card.tradeMissing) panel.append(element('p', 'hub__reason', `Для доплаты не хватает ${rubles(card.tradeMissing)}.`));
      }
      if (confirm) {
        const tradeIn = confirm === 'trade';
        const total = card.price - (tradeIn ? card.tradeIn : 0);
        const review = element('section', 'showroom__confirm');
        const result = tradeIn ? `После покупки ${active?.name} уйдёт в зачёт.` : active ? 'Прежняя машина останется у тебя.' : '';
        if (result) review.append(element('p', '', result));
        review.append(
          element('p', '', `Списать ${rubles(total)} · останется ${rubles(balance - total)}`),
          button(restoration ? 'Подтвердить ремонт' : 'Подтвердить покупку', 'confirm', () => dispatch({
            type: 'buyVehicle', target: card.target, tradeIn, expectedRevision: revision,
          }), true),
          button('Отмена', 'cancel', () => {
            confirm = null;
            errorMessage = '';
            render(tradeIn ? 'trade' : 'full');
          }));
        panel.append(review);
      }
    }
    const compare = element('details', 'showroom__compare');
    compare.open = focus === 'compare';
    const comparison = element('summary', '', 'Сравнить с текущей');
    comparison.dataset.showroomFocus = 'compare';
    compare.append(comparison, comparisonFor(active, card));
    panel.append(compare, button(card.goal ? 'Снять цель' : 'Сделать целью', 'goal', () => dispatch({
      type: 'toggleVehicleGoal', target: card.target, expectedRevision: revision,
    })));
    if (card.goal) panel.append(element('p', 'hub__detail', card.owned ? 'Цель достигнута' :
      card.fullMissing ? `До полной цены осталось ${rubles(card.fullMissing)}` : 'На полную цену уже хватает'));
    const error = element('p', 'hub__reason', errorMessage);
    error.setAttribute('role', 'alert');
    if (errorMessage) panel.append(error);
    const layout = element('div', 'showroom__layout');
    layout.append(visual, panel);
    dialog.replaceChildren(header, tabs, layout);
    if (focus === 'model' || focus === 'next' || focus === 'previous' || focus === 'work' || focus === 'personal') dialog.scrollTop = 0;
    if (focus) dialog.querySelector<HTMLElement>(`[data-showroom-focus="${focus}"]`)?.focus({ preventScroll: true });
  }

  dialog.addEventListener('close', () => {
    confirm = null;
    errorMessage = '';
    if (origin?.isConnected) origin.focus();
    else {
      const previous = root.querySelector<HTMLElement>(`[data-open-showroom="${origin?.dataset.openShowroom ?? 'work'}"]`);
      (previous ?? root.querySelector<HTMLElement>('[data-open-showroom]'))?.focus();
    }
    origin = null;
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const right = event.key === 'ArrowRight';
    event.preventDefault();
    dialog.querySelector<HTMLButtonElement>(`[data-showroom-focus="${right ? 'next' : 'previous'}"]`)?.click();
  });
  root.addEventListener('click', event => {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-open-showroom]');
    if (!trigger || !view?.showroom || dialog.open) return;
    category = trigger.dataset.openShowroom === 'personal' ? 'personal' : 'work';
    index[category] = Math.max(0, view.showroom[category].findIndex(card => card.active));
    origin = trigger;
    render();
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>('[data-showroom-focus="close"]')?.focus();
  });
  return {
    update(next: Stage7View) {
      const focus = (document.activeElement as HTMLElement | null)?.dataset.showroomFocus;
      view = next;
      if (!dialog.open) return;
      if (!next.showroom) return dialog.close();
      confirm = null;
      errorMessage = '';
      render(focus === 'confirm' || focus === 'activate' ? 'model' : focus);
    },
    error(message: string) {
      if (!dialog.open) return;
      errorMessage = message;
      render(confirm ? 'confirm' : 'model');
    },
  };
}

function comparisonFor(active: Card | undefined, card: Card): HTMLDListElement {
  const facts = element('dl', 'garage__facts');
  addFact(facts, 'Модель', `${active?.name ?? 'Нет машины'} → ${card.name}`);
  if (card.vehicle) {
    addFact(facts, 'Груз', `${active?.vehicle?.capacity ?? '—'} → ${card.vehicle.capacity}`);
    addFact(facts, 'Аукционов в день', `${active?.auctions ?? '—'} → ${card.auctions}`);
    addFact(facts, 'Длинномер', `${active?.bulky ? 'Да' : 'Нет'} → ${card.bulky ? 'Да' : 'Нет'}`);
  } else {
    addFact(facts, 'Цена', `${active ? rubles(active.price) : '—'} → ${rubles(card.price)}`);
    addFact(facts, 'Нужно очков статуса', `${active?.statusRequired ?? '—'} → ${card.statusRequired}`);
  }
  return facts;
}
