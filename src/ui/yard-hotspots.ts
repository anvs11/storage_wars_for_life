import type { HouseLevel } from '../game/houses';
import { actionButton, element } from './dom';

// Points in the coordinates of the 3:2 yard photographs.
const contours: Record<HouseLevel, { home: string; garage: string }> = {
  1: {
    home: '-0.16,15.78 9.38,10.11 20.63,6 30.86,6.11 31.33,6.56 36.88,9.56 36.88,4.67 37.11,3.78 39.61,4 39.69,4.67 39.53,4.89 39.61,11 56.17,19.56 56.09,20.33 55.47,20.78 55.23,22 53.05,22.33 52.89,45.11 53.67,45.56 53.59,50 22.11,51.89 21.64,53.11 19.77,54.89 19.38,55.89 18.83,55.89 18.75,56.67 8.05,56.78 8.13,55.89 7.58,55.89 7.5,53.11 0.94,53.89 -0.16,53.78',
    garage: '64.53,32.11 74.77,25.67 86.17,22.89 99.3,31.78 99.06,32.33 97.5,32 96.95,51.22 73.28,51 65.47,48.56 65.47,32.33 64.61,32.67',
  },
  2: {
    home: '0,27 38,1 57,23 55,53 25,56 24,58 12,58 10,53 3,53',
    garage: '63,35 81,25 97,33 95,54 68,54',
  },
  3: {
    home: '0,28 35,1 54,22 52,48 24,51 22,52 11,52 10,47 3,47',
    garage: '59,28 77,12 99,25 98,52 63,51',
  },
  4: {
    home: '0,12 22,1 34,1 50,22 53,30 51,48 34,50 32,52 18,52 15,50 1,49',
    garage: '60,29 75,15 99,27 98,49 64,48',
  },
  5: {
    home: '3,34 12,21 17,13 25,16 35,10 45,22 49,19 57,37 56,52 48,54 45,57 17,57 6,55',
    garage: '63,38 68,30 97,27 98,39 98,53 65,52',
  },
};

export function yardHotspot(level: HouseLevel, building: 'home' | 'garage', activate?: () => void): HTMLButtonElement {
  const name = building === 'home' ? 'Открыть шоурум домов' : 'Войти в гараж';
  const button = activate ? actionButton('', 'yard-hotspot', activate) : element('button', 'yard-hotspot');
  button.type = 'button';
  button.setAttribute('aria-label', name);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(ns, 'polygon');
  outline.setAttribute('points', contours[level][building]);
  svg.append(outline);
  button.append(svg);
  return button;
}
