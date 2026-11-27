import { choiceLabels } from '../game/life';
import type { Stage7Command, Stage7Dispatch, Stage7View } from '../game/stage7-engine';
import recordPlayer from './assets/scene-turntable.png';
import { actionButton, element, rubles } from './dom';
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
    meter.max = 100;
    meter.value = view.phone.score;
    meter.setAttribute('aria-label', 'Отношения');
    story.append(element('p', '', `${view.phone.tier} · ${view.phone.score} из 100`), meter);
    if (screen.nextGoal?.action === 'confirmMoveIn' && !screen.allowedActions.includes('confirmMoveIn')) {
      story.append(element('p', 'hub__detail', 'Прежде чем съезжаться, поговорите о близких отношениях в телефоне.'));
    }
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
    home.tabIndex = -1;
    const { display, displayCandidate } = life.home;
    if (display) {
      const image = element('img', 'life-home__record-player');
      image.src = recordPlayer;
      image.alt = display;
      home.append(image, element('p', '', 'Проигрыватель в комнате. Чтобы выставить его на продажу, верни в гараж.'),
        action('Вернуть проигрыватель в гараж', { type: 'retrieveTurntable' }));
    } else if (displayCandidate) home.append(action(`Поставить дома: ${displayCandidate}`, { type: 'displayTurntable' }));
    if (life.canOpen && !view.familyDate) home.append(action('Поговорить с соседкой', { type: 'openRelationship' }));
    if (home.childElementCount) root.querySelector('.yard-hero')?.after(home);
    if (previousFocus) (home.querySelector<HTMLElement>(`[data-life-focus="${CSS.escape(previousFocus)}"]`) ?? home).focus();
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
