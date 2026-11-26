import type { Stage4Command, Stage4Dispatch, Stage4HubView } from '../game/stage4-contract';
import { isVenue } from '../game/stage7-events';
import type { CalendarView } from '../game/stage7-calendar';
import { actionButton, bankFor, rubles, element, replaceScreen } from './dom';
import { relationshipGoalFor } from './relationship';

type HubView = Stage4HubView;
type HubOffer = HubView['offers'][number];

function statusFor(view: HubView): HTMLElement {
  const status = element('section', 'hub__status garage__panel');
  const heading = element('h2', 'garage__heading', `Рейтинг · ${view.status} очков`);
  status.append(heading);
  if (view.nextUnlock) {
    const { title, requiredStatus } = view.nextUnlock;
    const progress = element('progress', 'hub__progress');
    progress.max = requiredStatus;
    progress.value = view.status;
    progress.setAttribute('aria-label', `Рейтинг до открытия: ${title}`);
    status.append(progress, element('p', 'hub__detail', `Далее: ${title} · ${requiredStatus} очков`));
  } else {
    status.append(element('p', 'hub__detail', 'Все классы торгов открыты.'));
  }
  return status;
}

function offerMessage(offer: HubOffer): string {
  switch (offer.availability) {
    case 'owned': return 'Уже куплено';
    case 'statusLocked': return `Нужно ${offer.requiredStatus} очков`;
    case 'fundsLocked': return `Нужно ${rubles(offer.price)} для покупки`;
    case 'ready': return '';
  }
}

export function mountHub(root: HTMLElement, view: HubView, dispatch: Stage4Dispatch, goHome?: () => void, calendar?: CalendarView): void {
  const screen = element('section', 'garage hub');
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', 'Между торгами');
  title.tabIndex = -1;
  header.append(title, bankFor(view.bank));

  function button(label: string, command: Stage4Command, key: string, primary = false): HTMLButtonElement {
    const control = actionButton(label, primary ? 'garage__button garage__button--primary' : 'garage__button',
      () => dispatch(command));
    control.dataset.screenFocus = key;
    return control;
  }

  const auctions = element('section', 'hub__section');
  const auctionList = element('ul', 'hub__grid');
  for (const auction of view.auctions) {
    const card = element('li', 'garage__panel hub__card');
    const hasStatus = auction.availability !== 'statusLocked';
    card.append(
      element('h3', 'hub__name', auction.title),
      element('p', 'hub__detail', `Старт ${rubles(auction.openingBid)}`),
      element('p', 'hub__detail', hasStatus ? 'Доступ по рейтингу открыт' : `Нужно ${auction.requiredStatus} очков`),
    );
    if (auction.availability === 'fundsLocked' || auction.availability === 'recovery') {
      card.append(element('p', 'hub__reason', `Нужно ${rubles(auction.openingBid)} для ставки`));
    }
    if ((calendar?.outing !== null || calendar.bonusAuction === 'available') && view.allowedActions.includes('enterAuction') &&
        (auction.availability === 'ready' || auction.availability === 'recovery')) {
      const recover = auction.availability === 'recovery';
      const control = button(recover ? 'Восстановить банк' : 'К осмотру',
        { type: 'enterAuction', tier: auction.tier, expectedRevision: view.revision }, `auction:${auction.tier}`, true);
      control.setAttribute('aria-label', `${control.textContent}: ${auction.title}`);
      card.append(control);
    }
    auctionList.append(card);
  }
  auctions.append(element('h2', 'garage__heading', 'Аукционы'));
  if (calendar) auctions.append(element('p', 'hub__detail', calendar.outing
    ? `Аукцион займёт ${calendar.outing}.` : calendar.bonusAuction === 'available'
      ? 'Улучшенный пикап успеет на один вечерний аукцион.' : 'Следующий аукцион доступен утром.'));
  auctions.append(auctionList);

  const spending = element('section', 'hub__section');
  spending.append(
    element('h2', 'garage__heading', 'Досуг и улучшения'),
    element('p', 'hub__detail', 'Расходы повышают рейтинг и уменьшают банк для следующей ставки.'),
  );
  const offers = element('ul', 'hub__grid');
  const dinerOffers = view.offers.filter(({ id }) => id === 'diner' || id === 'dinerWithTip');
  const otherOffers = view.offers.filter(({ id }) => id !== 'diner' && id !== 'dinerWithTip');
  const groups = [...(dinerOffers.length ? [dinerOffers] : []), ...otherOffers.map((offer) => [offer])];
  for (const group of groups) {
    const card = element('li', 'garage__panel hub__card');
    const first = group[0];
    if (!first) continue;
    if (first.id === 'home') card.dataset.homeOffer = '';
    card.append(element('h3', 'hub__name', first.title));
    for (const offer of group) {
      const row = element('div', 'hub__offer');
      if (offer !== first) row.append(element('strong', '', offer.title));
      row.append(element('p', 'hub__detail', `${rubles(offer.price)} · +${offer.statusGain} к рейтингу`));
      const reason = offerMessage(offer);
      if (reason) row.append(element('p', 'hub__reason', reason));
      const visit = calendar && isVenue(offer.id) ? calendar : undefined;
      if (visit && offer.availability === 'ready') row.append(element('p', 'hub__detail', visit.outing
        ? `Посещение займёт ${visit.outing}.` : 'Посещение доступно утром.'));
      if (visit?.outing !== null && offer.availability === 'ready' && view.allowedActions.includes('spend')) {
        const control = button(`Потратить ${rubles(offer.price)}`,
          { type: 'spend', offerId: offer.id, expectedRevision: view.revision }, `offer:${offer.id}`);
        control.setAttribute('aria-label', `${offer.title}: ${control.textContent}`);
        row.append(control);
      }
      card.append(row);
    }
    offers.append(card);
  }
  spending.append(offers);

  const airport = element('section', 'hub__section garage__panel');
  airport.append(element('h2', 'garage__heading', 'Аэропорт'),
    element('p', 'hub__detail', `Закрытый чемодан · ${rubles(view.baggagePrice)}`));
  if (view.allowedActions.includes('callAirport')) {
    airport.append(button('Позвонить в аэропорт', { type: 'callAirport', expectedRevision: view.revision }, 'airport'));
  }

  const relationship = element('section', 'garage__panel hub__relationship');
  relationship.append(element('h2', 'garage__heading', 'История с соседями'));
  const { step, nextGoal } = view.relationship;
  if (nextGoal) relationship.append(relationshipGoalFor(nextGoal, view.status, view.bank));
  else relationship.append(element('p', 'hub__detail', 'Вы съехались. Эпилог можно открыть снова.'));

  if (view.allowedActions.includes('openRelationship')) {
    const label = step === 'unmet' ? 'К соседям' : step === 'movedIn' ? 'Открыть эпилог' : 'Продолжить историю';
    relationship.append(button(label, { type: 'openRelationship', expectedRevision: view.revision }, 'relationship'));
  }

  if (goHome) {
    const home = actionButton('Вернуться домой', 'garage__button', goHome);
    home.dataset.screenFocus = 'home';
    header.firstElementChild?.after(home);
  }
  screen.append(header, statusFor(view), auctions, relationship, spending, airport);
  replaceScreen(root, screen, title);
}
