import inherited from './assets/yard-inherited.jpg';
import renovated from './assets/yard-renovated.jpg';
import workshop from './assets/yard-workshop.jpg';
import gallery from './assets/yard-gallery.jpg';
import estate from './assets/yard-estate.jpg';

export const yards = {
  1: { image: inherited, alt: 'Старый деревянный дом и металлический гараж.' },
  2: { image: renovated, alt: 'Покрашенный деревянный дом и металлический гараж.' },
  3: { image: workshop, alt: 'Двор отремонтированного дома с открытой мастерской.' },
  4: { image: gallery, alt: 'Кирпичный коттедж со стеклянной галереей и отдельным двойным гаражом.' },
  5: { image: estate, alt: 'Каменная загородная усадьба с арочным окном и отдельным гаражом на три секции.' },
} as const;
