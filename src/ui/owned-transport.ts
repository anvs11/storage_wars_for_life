import type { Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import { trailerCatalog } from '../game/transport';
import { actionButton, addFact, element } from './dom';
import { personalCarPicture, trailerPicture, vehiclePicture } from './vehicle';

const tabs = { work: 'Рабочий', personal: 'Личный', trailers: 'Прицепы' } as const;
type Category = keyof typeof tabs;
const plain = 'garage__button';
const primary = plain + ' garage__button--primary';

export function mountOwnedTransport(root: HTMLElement, view: Stage7View, dispatch: Stage7Dispatch,
  previous?: DOMStringMap, focus?: string): void {
  const catalog = view.showroom;
  if (!catalog) return;
  const screen = root.querySelector('.stage5')!;
  const section = element('section', 'owned-transport');
  const revision = view.screen.revision;
  let category: Category = previous?.category === 'personal' || previous?.category === 'trailers' ? previous.category : 'work';
  function render(selected?: string, focusKey?: string): void {
    const owned = catalog![category].filter(card => card.owned);
    const active = owned.find(card => card.active);
    const card = owned.find(card => String(card.target.model) === selected) ?? active ?? owned[0];
    section.dataset.category = category;
    section.dataset.model = card ? String(card.target.model) : '';

    const nav = element('nav', 'showroom__tabs');
    nav.setAttribute('aria-label', 'Принадлежащий транспорт');
    for (const key of Object.keys(tabs) as Category[]) {
      const tab = actionButton(tabs[key], category === key ? primary : plain, () => {
        category = key;
        render(undefined, key);
      });
      tab.setAttribute('aria-pressed', String(category === key));
      tab.dataset.transportFocus = key;
      nav.append(tab);
    }
    const showroom = element('button', plain, 'В автосалон');
    showroom.type = 'button';
    showroom.dataset.openShowroom = category;
    const panel = element('section', 'garage__panel owned-transport__panel');
    if (!card) {
      panel.append(element('p', '', category === 'trailers' ? 'У тебя пока нет прицепов.' : 'У тебя пока нет личной машины.'), showroom);
      section.replaceChildren(nav, panel);
    } else {
      const picture = element('div', 'owned-transport__picture');
      const target = card.target;
      if (target.category === 'work' && card.vehicle) picture.append(vehiclePicture(target.model, card.vehicle.trailer));
      if (target.category === 'personal') picture.append(personalCarPicture(target.model));
      if (target.category === 'trailers') picture.append(trailerPicture(target.model));
      const heading = element('h2', 'garage__heading', card.name);
      heading.tabIndex = -1;
      heading.dataset.transportFocus = 'model';
      const facts = element('dl', 'garage__facts');
      if (card.vehicle) {
        addFact(facts, 'Грузовых мест', String(card.vehicle.capacity));
        addFact(facts, 'Длинномер', card.bulky ? 'Да' : 'Нет');
        addFact(facts, 'Аукционов в день', String(card.auctions));
        if (target.model === 'heavy') addFact(facts, 'Прицеп', card.vehicle.trailer !== undefined
          ? trailerCatalog[card.vehicle.trailer].name : 'Можно подсоединить');
      }
      if (target.category === 'trailers') addFact(facts, 'Грузовых мест с RAM', String(card.trailerCapacity));
      panel.append(heading, element('p', 'showroom__state', card.active
        ? target.category === 'trailers' ? 'Подсоединён к RAM' : 'Используется' : 'В собственности'), facts);
      if (!card.active) panel.append(actionButton(target.category === 'trailers' ? 'Подсоединить' : 'Сделать активной', primary,
        () => dispatch({ type: 'activateVehicle', target, expectedRevision: revision })));
      if (card.active && target.category === 'trailers') panel.append(actionButton('Отсоединить', plain,
        () => dispatch({ type: 'detachTrailer', target, expectedRevision: revision })));
      for (const button of panel.querySelectorAll('button')) button.dataset.transportFocus = 'model';
      const select = element('div', 'owned-transport__models');
      for (const model of owned) {
        const key = String(model.target.model);
        const button = actionButton(model.name, plain, () => render(key, key));
        button.setAttribute('aria-pressed', String(model === card));
        button.dataset.transportFocus = key;
        select.append(button);
      }
      panel.append(showroom);
      const layout = element('div', 'stage5__layout owned-transport__layout');
      layout.append(picture, panel);
      section.replaceChildren(nav, layout, select);
    }
    const tuning = screen.querySelector<HTMLElement>('.vehicle-tuning');
    if (tuning) tuning.hidden = category !== 'work' || card?.target.model !== 'heavy';
    if (focusKey) section.querySelector<HTMLElement>(`[data-transport-focus="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
  const tuning = screen.querySelector('.vehicle-tuning');
  if (tuning) tuning.before(section);
  else screen.append(section);
  render(previous?.model, focus);
}
