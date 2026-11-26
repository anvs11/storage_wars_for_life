import { choiceLabels } from '../game/life';
import type { Stage7Command, Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import recordPlayer from './assets/scene-turntable.png';
import { actionButton, element, rubles } from './dom';
import { personalCarPicture } from './vehicle';
import './life.css';

type Action<T = Stage7Command> = T extends Stage7Command ? Omit<T, 'expectedRevision'> : never;

export function mountLife(root: HTMLElement, view: Stage7View, dispatch: Stage7Dispatch, previousFocus: string | undefined): void {
  const { screen, calendar, life } = view;
  const action = (label: string, command: Action, primary = false) => {
    const button = actionButton(label, primary ? 'garage__button garage__button--primary' : 'garage__button',
      () => dispatch({ ...command, expectedRevision: screen.revision }));
    button.dataset.lifeFocus = command.type === 'chooseLife' ? command.choice : command.type;
    return button;
  };

  if (screen.phase === 'relationship') {
    const panel = root.querySelector('.relationship__panel');
    const story = element('section', 'life-story');
    const title = element('h2', 'garage__heading', life.scene?.title ?? 'Отношения с соседкой');
    title.tabIndex = -1;
    story.append(title);
    const meter = element('progress', 'life-meter');
    meter.max = 20;
    meter.value = life.score;
    meter.setAttribute('aria-label', 'Отношения');
    story.append(element('p', '', `Отношения · ${life.score} из 20`), meter);
    if (life.last) story.append(element('p', 'hub__detail', choiceLabels[life.last]));
    if (life.scene) {
      const oldReply = panel?.querySelector('.relationship__reply');
      if (oldReply instanceof HTMLElement) oldReply.hidden = true;
      story.append(element('blockquote', 'relationship__reply', life.scene.line));
      if (life.scene.id === 'listening' && !life.scene.choices.includes('listen')) {
        story.append(element('p', 'hub__reason', 'Сначала нужно починить проигрыватель в гараже.'));
      }
      for (const choice of life.scene.choices) story.append(action(choiceLabels[choice], { type: 'chooseLife', choice }, choice === 'talk'));
    }
    if (life.scene?.id === 'intro') {
      const legacyIntro = panel?.querySelector('[data-relationship-action="meetNeighbor"]');
      legacyIntro?.remove();
      panel?.querySelector('.relationship__goal')?.remove();
    }
    if (life.promise) {
      const label = life.promise.kind === 'camera' ? 'Найти исправный плёночный фотоаппарат' : `Вечер с пластинкой · ${life.promise.itemName}`;
      story.append(element('p', 'hub__detail', `${label} · срок до конца дня ${life.promise.due}`));
    }
    if (life.referral) {
      const { itemName, price, day } = life.referral;
      story.append(element('h3', 'hub__name', 'Частный запрос'), element('p', '', `Лера ищет «${itemName}». Предлагает ${rubles(price)}. Запрос открыт до конца дня ${day}.`),
        action('Открыть чат с Лерой', { type: 'openReferral' }));
    } else if (life.score < 6 && life.scene?.id !== 'intro') {
      story.append(element('p', 'hub__detail', 'Когда у вас появятся общие воспоминания и доверие, соседка сможет познакомить тебя с покупателями.'));
    }
    panel?.querySelector('.relationship__goal, .relationship__controls')?.before(story);
    if (previousFocus) {
      (story.querySelector<HTMLElement>(`[data-life-focus="${CSS.escape(previousFocus)}"]`) ?? title).focus({ preventScroll: true });
    }
  }

  if (screen.phase === 'home') {
    const home = element('section', 'garage__panel life-home');
    home.dataset.homeProjects = '';
    home.tabIndex = -1;
    const { level, workshopPrice, nextHouse, display, displayCandidate } = life.home;
    home.append(element('h2', 'garage__heading', ['Старый дом', 'Дом после ремонта', 'Дом с мастерской',
      'Коттедж с галереей', 'Загородная усадьба'][level - 1]));
    if (level === 1) {
      home.append(element('p', 'hub__detail', 'После ремонта дома можно поставить проигрыватель в комнате.'),
        action('Посмотреть ремонт дома', { type: 'navigate', room: 'auctions' }));
      home.lastElementChild?.addEventListener('click', () => {
        const offer = root.querySelector<HTMLElement>('[data-home-offer]');
        if (offer) {
          offer.tabIndex = -1;
          offer.focus();
        }
      });
    } else if (level === 2) {
      const upgrade = action(`Открыть мастерскую за ${rubles(workshopPrice)}`, { type: 'buyWorkshop' }, true);
      upgrade.disabled = screen.bank < workshopPrice;
      home.append(element('p', 'hub__detail', 'В мастерской ремонт находок стоит на 25% меньше.'), upgrade);
      if (upgrade.disabled) home.append(element('p', 'hub__reason', `Не хватает ${rubles(workshopPrice - screen.bank)}.`));
    } else home.append(element('p', 'hub__detail', 'Скидка 25% уже учтена в ценах ремонта в гараже.'));
    if (nextHouse) {
      const { level, price } = nextHouse;
      const title = level === 4 ? 'Купить коттедж с галереей' : 'Купить загородную усадьбу';
      const buy = action(`${title} за ${rubles(price)}`, { type: 'buyHouse', level }, true);
      buy.disabled = screen.bank < price;
      home.append(buy);
      if (buy.disabled) home.append(element('p', 'hub__reason', `Не хватает ${rubles(price - screen.bank)}.`));
    }
    if (display) {
      const image = element('img', 'life-home__record-player');
      image.src = recordPlayer;
      image.alt = display;
      home.append(image, element('p', '', 'Проигрыватель в комнате. Чтобы выставить его на продажу, верни в гараж.'),
        action('Вернуть проигрыватель в гараж', { type: 'retrieveTurntable' }));
    } else if (displayCandidate) home.append(action(`Поставить дома: ${displayCandidate}`, { type: 'displayTurntable' }));
    if (life.canOpen && !view.familyDate) home.append(action('Поговорить с соседкой', { type: 'openRelationship' }));
    const personal = element('details', 'garage__panel life-home personal-garage');
    personal.dataset.personalGarage = '';
    personal.open = previousFocus === 'buyPersonalCar';
    const personalTitle = element('summary', '', 'Личная машина');
    personal.append(personalTitle);
    if (view.personalCar) {
      const current = personalCarPicture(view.personalCar);
      current.className = 'personal-garage__picture';
      personal.append(element('p', '', `Сейчас во дворе · ${current.alt}`), current);
    } else personal.append(element('p', '', 'Личная машина нужна для поездок по городу.'));
    const offer = view.personalOffer;
    if (offer) {
      const preview = personalCarPicture(offer.id);
      preview.className = 'personal-garage__picture';
      const price = offer.tradeIn ? `Цена ${rubles(offer.price)} · зачёт ${rubles(offer.tradeIn)} · доплата ${rubles(offer.total)}`
        : `Цена ${rubles(offer.price)}`;
      personal.append(element('strong', '', offer.name), preview, element('p', 'hub__detail', price));
      if (offer.blocked) personal.append(element('p', 'hub__reason', offer.blocked));
      else personal.append(element('p', 'hub__detail', `После покупки останется ${rubles(screen.bank - offer.total)}.`));
      const buy = action(`Купить ${offer.name} за ${rubles(offer.total)}`, { type: 'buyPersonalCar', car: offer.id }, true);
      buy.disabled = offer.blocked !== null;
      personal.append(buy);
    }
    root.querySelector('.stage5__nav')?.after(home, personal);
    if (previousFocus === 'buyPersonalCar') personalTitle.focus();
    else if (previousFocus) (home.querySelector<HTMLElement>(`[data-life-focus="${CSS.escape(previousFocus)}"]`) ?? home).focus();
  }

  if (life.promise?.itemId && (screen.phase === 'market' || screen.phase === 'garage' || screen.phase === 'inbox')) {
    const { itemId, itemName, due } = life.promise;
    const warning = `«${itemName}» обещан к вечеру дня ${due}. Если отдать вещь, отношения ухудшатся.`;
    root.querySelector('.stage5__nav')?.after(element('p', 'garage__panel life-warning', warning));
    if (screen.phase === 'inbox') {
      const threads = root.querySelectorAll<HTMLElement>(`[data-sale-item="${CSS.escape(itemId)}"]`);
      for (const thread of threads) {
        const sale = thread.querySelector('button[data-screen-focus^="chat-sale:"]');
        if (sale) sale.before(element('p', 'hub__reason', warning));
      }
    }
  }
  if (life.home.display && (screen.phase === 'garage' || screen.phase === 'market')) {
    root.querySelector('.stage5__nav')?.after(element('p', 'garage__panel life-warning',
      'Проигрыватель стоит дома. Для продажи или упаковки верни его в гараж через экран дома.'));
  }
  if (calendar.period === 'evening' && screen.phase === 'home' && life.promise?.kind === 'listening' && life.promise.due === calendar.day) {
    root.querySelector('.stage7__rest')?.prepend(element('p', 'hub__reason', 'На этот вечер обещана встреча с соседкой.'));
  }
}
