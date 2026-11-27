import inherited from './assets/yard-parking-1.jpg';
import renovated from './assets/yard-parking-2.jpg';
import workshop from './assets/yard-parking-3.jpg';
import gallery from './assets/yard-parking-4.jpg';
import estate from './assets/yard-parking-5.jpg';
const vehiclePhotos = import.meta.glob<string>('./assets/parked-*.webp', {
  eager: true, import: 'default', query: '?url',
});

// Each crop includes the ground receiving the vehicle's shadow in this yard.
export function parkedPhoto(level: number, model?: string): string | undefined {
  return vehiclePhotos[`./assets/parked-${level}-${model}.webp`];
}

export const yards = {
  1: { image: inherited, alt: 'Старый деревянный дом и металлический гараж.' },
  2: { image: renovated, alt: 'Покрашенный деревянный дом и металлический гараж.' },
  3: { image: workshop, alt: 'Двор отремонтированного дома с открытой мастерской.' },
  4: { image: gallery, alt: 'Кирпичный коттедж со стеклянной галереей и отдельным двойным гаражом.' },
  5: { image: estate, alt: 'Каменная загородная усадьба с арочным окном и отдельным гаражом на три секции.' },
} as const;
