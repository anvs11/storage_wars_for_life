import { offers } from '../game/progression';
import { outingNames } from '../game/stage7-calendar';
import type { CalendarView } from '../game/stage7-calendar';
import type { VisitRecord, VisitVenue } from '../game/stage7-events';
import type { VehicleView } from '../game/stage5-contract';
import type { Stage7Dispatch } from '../game/stage7-engine';
import cinema from './assets/stage7-visit-cinema.jpg';
import diner from './assets/stage7-visit-diner.jpg';
import restaurant from './assets/stage7-visit-restaurant.jpg';
import theater from './assets/stage7-visit-theater.jpg';
import { actionButton, addFact, bankFor, element, replaceScreen, rubles } from './dom';
import { vehiclePicture } from './vehicle';
import './stage7-trip.css';

const duration = 5000;
const primary = 'garage__button garage__button--primary';
const dinerPhoto = { src: diner, alt: 'Чашка и выпечка на столике у окна закусочной.' };
const photos = {
  diner: dinerPhoto,
  dinerWithTip: dinerPhoto,
  cinema: { src: cinema, alt: 'Красные кресла и экран в небольшом кинозале.' },
  restaurant: { src: restaurant, alt: 'В ресторане накрыт стол на двоих.' },
  theater: { src: theater, alt: 'Бархатный занавес и рампа в небольшом театре.' },
} satisfies Record<VisitVenue, { src: string; alt: string }>;

export function mountPaidVisit(
  root: HTMLElement,
  record: VisitRecord,
  scene: { bank: number; revision: number; calendar: CalendarView; relationship: boolean; vehicle: VehicleView['model'] },
  dispatch: Stage7Dispatch,
  animate: boolean,
): void {
  const eventName = record.together
    ? record.venue === 'cinema' ? 'Кино вдвоём' : 'Ужин вдвоём'
    : offers[record.venue].title;
  const { bank, revision, calendar, relationship } = scene;
  const { src, alt } = photos[record.venue];

  function showPhoto(): void {
    const screen = element('section', 'garage');
    const header = element('header', 'garage__header');
    const title = element('h1', 'garage__title', 'Фото из поездки');
    title.tabIndex = -1;
    header.append(title, bankFor(bank));

    const backdrop = element('div', 'stage7__visit-backdrop');
    const figure = element('figure', 'stage7__visit-photo');
    const image = element('img', '');
    image.src = src;
    image.alt = alt;
    figure.append(image);

    const report = element('section', 'garage__panel stage7__visit-details');
    const facts = element('dl', 'garage__facts');
    addFact(facts, 'Потрачено', rubles(record.spent));
    addFact(facts, 'Рейтинг', `+${record.statusGain}`);
    report.append(
      element('h2', 'garage__heading', eventName),
      element('p', 'hub__detail', `День ${record.day} · ${outingNames[record.outing]}`),
      facts,
      element('p', 'hub__detail', `Выезды до вечера · ${calendar.remainingOutings}`),
      actionButton(relationship ? 'Продолжить историю' : 'Закрыть фото', primary,
        () => dispatch({ type: 'closeVisitPhoto', expectedRevision: revision })),
    );
    backdrop.append(figure, report);
    screen.append(header, backdrop);
    replaceScreen(root, screen, title);
  }

  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    showPhoto();
    return;
  }

  const screen = element('section', 'garage');
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', eventName);
  title.tabIndex = -1;
  header.append(title, bankFor(bank));
  const backdrop = element('div', 'stage7__travel-stage');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.setProperty('--trip-duration', `${duration}ms`);
  const actor = element('div', 'stage7__traveler');
  actor.append(element('span', 'stage7__traveler-legs'));
  const car = vehiclePicture(scene.vehicle);
  car.className = 'stage7__travel-car';
  backdrop.append(actor, car, element('div', 'stage7__travel-dusk'));

  const timer = window.setTimeout(finish, duration);
  function finish(): void {
    window.clearTimeout(timer);
    if (root.contains(screen)) showPhoto();
  }
  screen.append(header, backdrop, actionButton('Пропустить поездку', 'garage__button', finish));
  replaceScreen(root, screen, title);
}
