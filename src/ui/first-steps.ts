import { marketOffers } from '../game/market-dialogue';
import type { Stage7State, Stage7View } from '../game/stage7-engine';
import portrait from './assets/bidder-player.jpg';
import { actionButton, element, rubles } from './dom';
import './first-steps.css';

interface Tip {
  title: string;
  body: string;
  target: string;
}

function firstTip(state: Stage7State, view: Stage7View): Tip | null {
  const { screen, calendar } = view;
  const { base } = state;
  const game = base.base.game;
  if (game.phase === 'prologue' || view.paidVisit?.open || view.flea.visit || calendar.period === 'night') return null;

  const lot = game.lotNumber;
  const starterItem = base.items.find(({ id }) => id === 'home-kettle') ?? base.items[0];
  const active = base.listings.some(listing => marketOffers(listing).some(offer => !offer.closed));
  const firstSale = base.lastSale;

  if (lot === 0 && screen.phase === 'garage' && !firstSale && starterItem) {
    if (active) return { title: 'Покупатель уже написал', body: 'Открой сообщения и посмотри, сколько он предлагает.', target: '[data-screen-focus="inbox"]' };
    return { title: 'Первая вещь на продажу', body: `На полках остались бабушкины вещи. Для начала осмотри «${starterItem.name}» и выбери «К объявлению».`, target: `[data-screen-focus="scene:${CSS.escape(starterItem.id)}"]` };
  }
  if (lot === 0 && screen.phase === 'market' && !firstSale && starterItem) {
    if (active) return { title: 'У объявления есть отклик', body: 'Пора открыть сообщения. Объявление останется на доске, пока вещь не продана.', target: '[data-screen-focus="inbox"]' };
    return { title: 'Назови цену', body: 'Начни с цены из диапазона оценки и опубликуй объявление. Слишком высокая цена может отпугнуть покупателей.', target: `[data-screen-focus="publish:${CSS.escape(starterItem.id)}"]` };
  }
  if (lot === 0 && screen.phase === 'inbox' && !firstSale && active) {
    return { title: 'Перед первой сделкой', body: 'Открой диалог. Можно принять сумму покупателя, написать свою цену или оставить предложение без ответа.', target: '.market-thread[open][data-active-offer] button.garage__button--primary, .market-thread:not([open])[data-active-offer] summary' };
  }
  if (lot === 0 && firstSale && (screen.phase === 'inbox' || screen.phase === 'home' || screen.phase === 'garage') && calendar.outing) {
    return { title: `Первая выручка — ${rubles(firstSale.price)}`,
      body: 'Деньги уже в банке. В «К торгам» проверь стартовую цену обычного гаража.',
      target: '[data-screen-focus="auctions"]' };
  }
  if (lot === 0 && screen.phase === 'hub' && calendar.outing) {
    const ordinary = screen.auctions.find(auction => auction.tier === 'ordinary');
    if (ordinary?.availability === 'ready') return { title: 'Первый выезд', body: `Обычный гараж начинается с ${rubles(ordinary.openingBid)}. Осмотр бесплатный.`, target: '[data-screen-focus="auction:ordinary"]' };
    return { title: 'Сначала нужен капитал', body: 'Продай вещи из гаража или возьми заказ на сортировку после просмотра рекламы.', target: '[data-screen-focus="auction:ordinary"]' };
  }
  if (lot <= 2 && (screen.phase === 'inspection' || screen.phase === 'bidding')) {
    const item = screen.visibleItems.find(find => find.canInspect);
    if (screen.phase === 'inspection' && !screen.visibleItems.some(find => find.hint) && item) {
      return { title: 'Что видно у двери?', body: 'Нажми на видимую вещь. Лупа подскажет примерную цену именно этой находки.', target: `[data-garage-focus="inspect:${CSS.escape(item.id)}"]` };
    }
    return { title: 'Реши, сколько готов отдать', body: 'Ведущий называет шаг, соперники отвечают. Если цена выше твоего предела, нажми «Пас».', target: screen.allowedActions.includes('bid') ? '[data-garage-focus="bid"]' : '[data-garage-focus="pass"]' };
  }
  if (screen.phase === 'cargo' && !screen.baggage && screen.lotNumber <= 2) {
    if (screen.boxes.length && !base.cargo.length) return { title: 'Гараж твой', body: 'Открой коробку или отодвинь ширму. Теперь можно узнать, что было скрыто.', target: '[data-screen-focus^="open:"]' };
    if (!base.cargo.length) return { title: 'Возьми вещь в руки', body: 'Нажми на предмет, сравни оценку и состояние. Забери то, что стоит места в машине.', target: '[data-screen-focus^="pick:"]' };
    return { title: 'Отвези находки в гараж', body: 'После разбора вещи появятся дома. Оттуда их можно выставить на доске.', target: '.stage5__confirm summary, [data-screen-focus="finish"]' };
  }
  if (lot > 0 && lot <= 2 && screen.phase === 'garage' && base.deals.length > 0) {
    const find = base.items.find(item => item.lotNumber !== null && !base.listings.some(listing => listing.itemId === item.id));
    if (find) return { title: 'От находки до выручки', body: 'Открой привезённую вещь. Если риск поломки высокий, сравни цену ремонта с возможной выручкой.', target: `[data-screen-focus="scene:${CSS.escape(find.id)}"]` };
  }
  return null;
}

export function mountFirstSteps(root: HTMLElement, state: Stage7State, view: Stage7View, dismiss: () => void): void {
  const tip = firstTip(state, view);
  if (!tip) return;
  root.querySelector(tip.target)?.classList.add('first-step-target');
  const panel = element('aside', 'first-step');
  panel.setAttribute('aria-label', 'Обучение');
  const avatar = element('img', '');
  avatar.src = portrait;
  avatar.alt = '';
  const message = element('div', 'first-step__message');
  message.setAttribute('role', 'status');
  message.append(element('strong', '', tip.title), element('p', '', tip.body));
  panel.append(avatar, message, actionButton('×', 'first-step__dismiss', dismiss));
  panel.lastElementChild?.setAttribute('aria-label', 'Скрыть обучение');
  const auction = root.querySelector('.auction-layout');
  if (auction) auction.append(panel);
  else root.querySelector('.garage__header')?.after(panel);
}
