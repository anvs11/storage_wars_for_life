import { houseLevels, houses } from '../game/houses';
import type { HouseLevel } from '../game/houses';
import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import { actionButton, addFact, bankFor, element, rubles } from './dom';
import { yards } from './yards';
import './showroom.css';

const triggerSelector = '[data-open-house-showroom]';

export function createHouseShowroom(root: HTMLElement, dispatch: Stage7Dispatch) {
  const dialog = element('dialog', 'showroom house-showroom');
  dialog.setAttribute('aria-labelledby', 'house-showroom-title');
  root.after(dialog);
  let view: Stage7View | undefined;
  let level: HouseLevel = 1;
  let confirming = false;
  let error = '';

  function render(focus?: string) {
    if (!view || view.screen.phase !== 'home') return;
    const { bank, revision } = view.screen;
    const current = view.life.home.level;
    const house = houses[level];
    const missing = Math.max(0, house.price - bank);

    function button(label: string, key: string, run: () => void, primary = false) {
      const control = actionButton(label, primary ? 'garage__button garage__button--primary' : 'garage__button', run);
      control.dataset.houseFocus = key;
      return control;
    }

    function step(delta: number, focusKey: string) {
      level = houseLevels[(houseLevels.indexOf(level) + delta + houseLevels.length) % houseLevels.length]!;
      confirming = false;
      error = '';
      render(focusKey);
    }

    const header = element('header', 'showroom__header');
    const title = element('h1', 'garage__title', 'Шоурум домов');
    title.id = 'house-showroom-title';
    header.append(button('Назад', 'close', () => dialog.close()), title, bankFor(bank));

    const visual = element('section', 'showroom__visual');
    const photo = element('img', 'house-showroom__photo');
    photo.src = yards[level].image;
    photo.alt = yards[level].alt;
    const controls = element('div', 'showroom__arrows');
    const previous = button('‹', 'previous', () => step(-1, 'previous'));
    previous.setAttribute('aria-label', 'Предыдущий дом');
    const next = button('›', 'next', () => step(1, 'next'));
    next.setAttribute('aria-label', 'Следующий дом');
    controls.append(previous, element('span', '', `${level} из ${houseLevels.length}`), next);
    visual.append(photo, controls);

    const panel = element('section', 'garage__panel showroom__card');
    const live = element('div', 'showroom__model-heading');
    live.setAttribute('aria-live', 'polite');
    const heading = element('h2', 'garage__heading', house.name);
    heading.tabIndex = -1;
    heading.dataset.houseFocus = 'model';
    live.append(heading, element('p', 'hub__detail', house.detail));
    panel.append(live);
    if (level <= current) {
      panel.append(element('p', 'showroom__state', level === current ? 'Твой текущий дом' : 'У тебя уже есть дом выше классом'));
    } else {
      panel.append(element('p', 'showroom__price', rubles(house.price)));
      if (missing) panel.append(element('p', 'hub__reason', `До покупки не хватает ${rubles(missing)}.`));
      const buy = button('Купить дом', 'buy', () => {
        confirming = true;
        render('confirm');
      }, true);
      buy.disabled = missing > 0;
      panel.append(buy);
      if (confirming && !missing) {
        const review = element('section', 'showroom__confirm');
        review.append(element('p', '', `После переезда в банке останется ${rubles(bank - house.price)}.`),
          button('Подтвердить покупку', 'confirm', () => {
            if (level !== 1) dispatch({ type: 'buyHouse', level, expectedRevision: revision });
          }, true),
          button('Отмена', 'cancel', () => {
            confirming = false;
            error = '';
            render('buy');
          }));
        panel.append(review);
      }
      const compare = element('details', 'showroom__compare');
      const comparison = element('dl', 'garage__facts');
      addFact(comparison, 'Сейчас', houses[current].name);
      addFact(comparison, 'После переезда', house.name);
      addFact(comparison, 'Скидка на ремонт находок', `${current >= 3 ? '25%' : '0%'} → ${level >= 3 ? '25%' : '0%'}`);
      compare.append(element('summary', '', 'Сравнить с текущим домом'), comparison);
      panel.append(compare);
    }
    if (error) {
      const message = element('p', 'hub__reason', error);
      message.setAttribute('role', 'alert');
      panel.append(message);
    }
    const layout = element('div', 'showroom__layout');
    layout.append(visual, panel);
    dialog.replaceChildren(header, layout);
    if (focus) dialog.querySelector<HTMLElement>(`[data-house-focus="${focus}"]`)?.focus();
  }

  dialog.addEventListener('close', () => {
    confirming = false;
    error = '';
    root.querySelector<HTMLElement>(triggerSelector)?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const key = event.key === 'ArrowLeft' ? 'previous' : 'next';
    dialog.querySelector<HTMLButtonElement>(`[data-house-focus="${key}"]`)?.click();
  });
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(triggerSelector) || view?.screen.phase !== 'home' || dialog.open) return;
    level = view.life.home.level;
    render();
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.querySelector<HTMLElement>('[data-house-focus="close"]')?.focus();
  });
  return {
    update(next: Stage7View) {
      view = next;
      if (!dialog.open) return;
      if (view.screen.phase !== 'home') return dialog.close();
      confirming = false;
      error = '';
      render('model');
    },
    error(message: string) {
      if (!dialog.open) return;
      error = message;
      render('confirm');
    },
  };
}
