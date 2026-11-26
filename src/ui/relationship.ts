import type {
  RelationshipGoal, RelationshipGoalAction, RelationshipStep, RelationshipView, Stage4Dispatch,
} from '../game/stage4-contract';
import type { CalendarView } from '../game/stage7-calendar';
import { relationshipVenue } from '../game/stage7-events';
import { offers } from '../game/progression';
import epilogueImage from './assets/relationship-home.jpg';
import neighborImage from './assets/relationship-neighbor.jpg';
import { actionButton, bankFor, rubles, element, replaceScreen } from './dom';
import './relationship.css';

const scenes = {
  unmet: {
    title: 'Новые соседи',
    caption: 'В большой дом по соседству въехала семья. Их двадцатилетняя дочь первая заводит разговор.',
    reply: '«Привет! Говорят, ты ходишь на торги. Там правда можно найти старый проигрыватель, который ещё работает?»',
    image: neighborImage,
    alt: 'Девушка у крыльца соседнего дома, рядом коробки с вещами после переезда.',
  },
  met: {
    title: 'Разговор у крыльца',
    reply: '«Покажешь пластинки, когда попадутся? Мне нравится узнавать, кому раньше принадлежала вещь».',
  },
  flowersGiven: {
    title: 'Цветы и афиша',
    reply: '«Спасибо за цветы! В кино показывают старый фильм. На афише проигрыватель, как тот, о котором мы говорили».',
  },
  cinemaVisited: {
    title: 'После кино',
    reply: '«Помнишь радио в фильме? За ужином расскажешь, как на торгах понять, что такое радио ещё работает?»',
  },
  dinnerVisited: {
    title: 'Планы на двоих',
    reply: '«Мне нравится, что любое старьё у тебя обрастает историей. Когда закончишь с домом и машиной, давай съедемся?»',
  },
  movedIn: {
    title: 'Теперь дома',
    reply: '«Мои книги уже на твоей полке. Оставим рядом место для самой необычной вещи, которую ты найдёшь на следующих торгах?»',
    image: epilogueImage,
    alt: 'Обновлённый деревянный дом с освещённым крыльцом и машиной у подъезда.',
  },
} satisfies Record<RelationshipStep, { title: string; reply: string; caption?: string; image?: string; alt?: string }>;

const actions: Record<RelationshipGoalAction, string> = {
  meetNeighbor: 'Познакомиться',
  buyFlowers: 'Купить цветы',
  inviteToCinema: 'Пригласить в кино',
  inviteToDinner: 'Пригласить на ужин',
  confirmMoveIn: 'Съехаться',
};

export function relationshipGoalFor(goal: RelationshipGoal, status: number, bank: number): HTMLElement {
  const block = element('div', 'relationship__goal');
  const price = goal.price === null ? '' : ` · ${rubles(goal.price)}`;
  block.append(element('strong', '', actions[goal.action] + price));

  if (goal.requiredStatus !== null && status < goal.requiredStatus) {
    block.append(element('p', 'relationship__condition', `Нужно ${goal.requiredStatus} очков рейтинга. Сейчас ${status}.`));
  }
  if (goal.price !== null && bank < goal.price) {
    block.append(element('p', 'relationship__condition', `Не хватает ${rubles(goal.price - bank)}.`));
  }
  if (goal.missingUpgrades.length) {
    const upgrades = goal.missingUpgrades.map((asset) => asset === 'home' ? 'дом' : 'машину');
    block.append(element('p', 'relationship__condition', `Нужно улучшить ${upgrades.join(' и ')}.`));
  }
  return block;
}

export function mountRelationship(root: HTMLElement, view: RelationshipView, dispatch: Stage4Dispatch, calendar?: CalendarView): void {
  const scene = scenes[view.step];
  const screen = element('section', 'garage relationship');
  const header = element('header', 'garage__header');
  const title = element('h1', 'garage__title', scene.title);
  title.tabIndex = -1;
  header.append(title, bankFor(view.bank));

  const layout = element('div', 'relationship__layout');
  const location = 'image' in scene ? scene : scenes.unmet;
  const art = element('img', 'relationship__image');
  art.src = location.image;
  art.alt = location.alt;
  layout.classList.add('relationship__layout--illustrated');
  layout.append(art);

  const panel = element('section', 'garage__panel relationship__panel');
  panel.append(element('p', 'hub__detail', `Рейтинг · ${view.status} очков`));
  if ('caption' in scene) panel.append(element('p', 'hub__detail', scene.caption));
  panel.append(element('blockquote', 'relationship__reply', scene.reply));
  const controls = element('div', 'garage__controls relationship__controls');
  const goal = view.nextGoal;
  if (goal) {
    panel.append(relationshipGoalFor(goal, view.status, view.bank));
    const venue = relationshipVenue(goal.action);
    const visit = venue ? calendar : undefined;
    if (venue) panel.append(element('p', 'hub__detail', `После встречи · +${offers[venue].statusGain} к рейтингу`));
    if (visit && goal.canProceed) panel.append(element('p', 'hub__detail', visit.outing
      ? `Встреча займёт ${visit.outing}.` : 'Поехать на встречу можно утром.'));
    if (visit?.outing !== null && goal.canProceed && view.allowedActions.includes(goal.action)) {
      const price = goal.price === null ? '' : ` за ${rubles(goal.price)}`;
      const action = actionButton(actions[goal.action] + price, 'garage__button garage__button--primary',
        () => dispatch({ type: goal.action, expectedRevision: view.revision }));
      action.dataset.relationshipAction = goal.action;
      controls.append(action);
    }
  }
  if (view.allowedActions.includes('returnToHub')) {
    controls.append(actionButton('К выбору торгов', goal ? 'garage__button' : 'garage__button garage__button--primary',
      () => dispatch({ type: 'returnToHub', expectedRevision: view.revision })));
  }
  panel.append(controls);
  layout.append(panel);
  screen.append(header, layout);
  replaceScreen(root, screen, title);
}
