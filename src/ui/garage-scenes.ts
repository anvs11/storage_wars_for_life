import tutorial from './assets/tutorial-garage.png';
import workshop from './assets/garage-workshop.jpg';
import household from './assets/garage-household.jpg';
import selected from './assets/garage-selected.jpg';
import antiques from './assets/garage-antiques.jpg';

export const garageScenes = {
  tutorial: {
    title: 'Учебный гараж',
    image: tutorial,
    alt: 'Поднятые металлические ворота. Слева велосипед с потёртой рамой, справа заклеенная коробка.',
  },
  workshop: {
    title: 'Гараж-мастерская',
    image: workshop,
    alt: 'Гараж с блочными стенами, рабочей столешницей и холодным светом.',
  },
  household: {
    title: 'Домашний гараж',
    image: household,
    alt: 'Гараж с деревянными балками, встроенными полками и тёплым светом из бокового окна.',
  },
  selected: {
    title: 'Отборный гараж',
    image: selected,
    alt: 'Просторный склад с синими металлическими стенами, высоким окном и пустым стеллажом.',
  },
  antiques: {
    title: 'Антикварный гараж',
    image: antiques,
    alt: 'Старый кирпичный гараж с тёмными балками, каменным полом и тёплым светом.',
  },
} as const;
