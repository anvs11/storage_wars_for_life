import door from './assets/story-door.jpg';
import rain from './assets/story-rain.jpg';
import driver from './assets/story-driver.jpg';
import rental from './assets/story-rental.jpg';
import './story.css';

export type StoryStep =
  | { readonly step: 'door' }
  | { readonly step: 'rain' }
  | { readonly step: 'dialogue'; readonly line: 0 | 1 | 2 | 3 | 4 | 5 }
  | {
      readonly step: 'rent';
      readonly grant: number;
      readonly rent: number;
      readonly remaining: number;
      readonly rentalWeeks: number;
    };

type StoryAction = 'storyNext' | 'skipStory' | 'confirmRent';

const frames = {
  door: {
    image: door,
    title: 'У порога',
    alt: 'Парень с дорожной сумкой выходит из дома. В сером коридоре позади стоят родители.',
  },
  rain: {
    image: rain,
    title: 'Под ливнем',
    alt: 'Тёмный седан проезжает через лужу и обдаёт парня водой.',
  },
  dialogue: {
    image: driver,
    title: 'Встреча на обочине',
    alt: 'Водитель вышел из остановившейся машины и протягивает деньги промокшему парню.',
  },
  rent: {
    image: rental,
    title: 'Старый дом',
    alt: 'Парень с сумкой подходит к старому деревянному дому с перекошенным крыльцом.',
  },
} as const;

const dialogue = [
  ['Водитель', 'Прости. Я слишком поздно увидел лужу. Возьми двести долларов.'],
  ['Герой', 'Двести? А вы чем зарабатываете?'],
  ['Водитель', 'Покупаю содержимое гаражей на торгах. Вчера под брезентом оказался старый дорожный велосипед.'],
  ['Герой', 'И вы знали, сколько он стоит, ещё от двери?'],
  ['Водитель', 'Видел втулку и клеймо. Ставил столько, чтобы хватило на ремонт и осталось с продажи.'],
  ['Герой', 'Вот бы и мне посмотреть на такой гараж.'],
] as const;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountStory(
  root: HTMLElement,
  story: StoryStep,
  allowedActions: readonly string[],
  dispatch: (action: StoryAction) => void,
): void {
  const restoreFocus = root.contains(document.activeElement);
  const frame = frames[story.step];
  const screen = node('section', 'story');
  const heading = node('h1', 'story__title', frame.title);
  const image = node('img', 'story__image');
  image.src = frame.image;
  image.alt = frame.alt;
  image.width = 1200;
  image.height = 800;

  const panel = node('div', 'story__panel');
  const copy = node('div', 'story__copy');
  copy.tabIndex = -1;
  copy.append(heading);

  switch (story.step) {
    case 'door':
      copy.append(
        node('p', 'story__speaker', 'Родители'),
        node('p', 'story__text', '«И как ты собираешься жить? У тебя ничего не выйдет!»'),
      );
      break;
    case 'rain':
      copy.append(node('p', 'story__text', 'Машина пронеслась мимо и окатила тебя водой. Через несколько метров водитель остановился.'));
      break;
    case 'dialogue': {
      const [speaker, line] = dialogue[story.line];
      copy.append(
        node('p', 'story__speaker', speaker),
        node('p', 'story__text', `«${line}»`),
      );
      break;
    }
    case 'rent': {
      const weeks = new Intl.NumberFormat('ru', { style: 'unit', unit: 'week', unitDisplay: 'long' });
      const term = story.rentalWeeks === 2
        ? 'Аренда на две недели'
        : `Срок аренды — ${weeks.format(story.rentalWeeks)}`;
      copy.append(
        node('p', 'story__text', term),
        node('p', 'story__caption', 'После аренды — стартовый банк для торгов.'),
        node('p', 'story__equation', `$${story.grant} − $${story.rent} = $${story.remaining}`),
      );
      break;
    }
  }

  const actions = node('div', 'story__actions');
  const primary = story.step === 'rent' ? 'confirmRent' : 'storyNext';
  for (const [action, label] of [
    [primary, story.step === 'rent' ? 'Подтвердить аренду' : 'Дальше'],
    ['skipStory', 'Пропустить'],
  ] as const) {
    if (!allowedActions.includes(action)) continue;
    const button = node('button', action === primary ? 'story__button story__button--primary' : 'story__button', label);
    button.type = 'button';
    button.addEventListener('click', () => dispatch(action));
    button.addEventListener('keydown', (event) => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    actions.append(button);
  }

  panel.append(copy, actions);
  screen.append(image, panel);
  root.replaceChildren(screen);
  if (restoreFocus) copy.focus();
}
