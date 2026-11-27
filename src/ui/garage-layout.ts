import type { GarageItemView } from '../game/stage5-contract';
import rack from './assets/garage-rack.webp';
import { actionButton, element } from './dom';
import { garageSprite } from './scene-sprites';

type Surface = 'upper' | 'middle' | 'lower' | 'bench' | 'floor' | 'oversize';
type Slot = readonly [surface: Surface, x: number, y: number, width: number, height: number];

// Each point is a contact point on the 3:2 garage photograph. Width and height bound
// the visible silhouette, so a thin level and a tall lamp can sit on the same surface.
const builtInSlots: readonly Slot[] = [
  ['upper', .107, .331, .117, .132],
  ['middle', .106, .518, .117, .146],
  ['lower', .113, .693, .132, .136],
  ['bench', .805, .508, .145, .185],
  ['middle', .935, .528, .103, .134],
  ['lower', .936, .711, .103, .147],
  ['floor', .687, .83, .224, .238],
  ['floor', .515, .95, .22, .24],
  ['oversize', .281, .858, .292, .32],
];
const debug = import.meta.env.DEV && new URLSearchParams(location.search).has('garage-layout');

function homeSurfaces(item: GarageItemView): readonly Surface[] {
  if (item.position === 'jewelryBox') return [];
  if (/велосипед|напольный светильник|ширма/i.test(item.name)) return ['oversize'];
  if (item.position === 'floor') return ['floor', 'oversize'];
  if (/гаечных ключей|тиски|дрель|усилитель|проигрыватель|швейная машина/i.test(item.name)) return ['bench', 'lower', 'floor'];
  return ['upper', 'middle', 'lower', 'bench'];
}

function piece(item: GarageItemView, inspect: (item: GarageItemView, source: HTMLElement) => void): HTMLButtonElement {
  const button: HTMLButtonElement = actionButton('', 'garage-piece', () => inspect(item, button));
  button.dataset.screenFocus = 'scene:' + item.id;
  button.setAttribute('aria-label', `Осмотреть: ${item.name}`);
  return button;
}

export function placeGarageItems(board: HTMLElement, items: readonly GarageItemView[], racks: number,
  inspect: (item: GarageItemView, source: HTMLElement) => void, level = 1): HTMLElement {
  const slots = [...builtInSlots];
  for (const x of [.38, .62].slice(0, racks)) {
    const image = element('img', 'garage-placement__rack');
    image.src = rack;
    image.alt = 'Дополнительный стеллаж';
    image.style.left = `${x * 100}%`;
    board.append(image);
    slots.push(['middle', x, .61, .082, .078], ['lower', x, .68, .082, .071]);
  }
  // Display fixtures change with the property. Storage limits still come from the inventory.
  const fixtures: readonly [number, number, string][] = [
    [2, .25, 'Полка для домашних вещей'], [3, .71, 'Инструментальная стойка'],
    [4, .48, 'Выставочная секция'], [5, .84, 'Стеллаж для коллекции'],
  ];
  for (const [tier, x, name] of fixtures) {
    if (tier > level) continue;
    const fixture = element('img', 'garage-fixture garage-fixture--' + tier);
    fixture.src = rack;
    fixture.alt = name;
    fixture.style.left = x * 100 + '%';
    board.append(fixture);
    slots.unshift(['middle', x, .675, .08, .075], ['lower', x, .745, .08, .065]);
  }
  const occupied = new Set<Slot>();
  const overflow = element('details', 'garage-overflow');
  const list = element('div', 'garage-overflow__list');
  let hidden = 0;
  for (const item of items) {
    const sprite = garageSprite(item.name);
    const surfaces = homeSurfaces(item);
    // The inventory is ordered by acquisition. Appending items can only use loose slots.
    const slot = surfaces.map(surface => slots.find(candidate => candidate[0] === surface && !occupied.has(candidate)))
      .find(candidate => candidate !== undefined);
    const button = piece(item, inspect);
    const name = element('span', 'garage-piece__label', item.name);
    if (!slot || !sprite) {
      if (sprite) button.append(sprite.picture);
      button.append(name);
      if (debug) button.append(element('small', '', !sprite ? 'Нет спрайта' : surfaces.length ? 'Поверхности заняты' : 'Шкатулка'));
      list.append(button);
      hidden++;
      continue;
    }
    occupied.add(slot);
    const [surface, x, y, maxWidth, maxHeight] = slot;
    const [minX, minY, maxX, maxY] = sprite.bounds;
    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;
    const artWidth = Math.min(maxWidth / bboxWidth, maxHeight / (bboxHeight * 1.5));
    button.classList.add('garage-placement');
    button.style.setProperty('--x', `${x * 100}%`);
    button.style.setProperty('--y', `${y * 100}%`);
    button.style.setProperty('--w', `${artWidth * bboxWidth * 100}%`);
    button.style.setProperty('--h', `${artWidth * bboxHeight * 150}%`);
    button.style.setProperty('--sprite-w', `${100 / bboxWidth}%`);
    button.style.setProperty('--sprite-x', `${-minX / bboxWidth * 100}%`);
    button.style.setProperty('--sprite-y', `${-minY / bboxHeight * 100}%`);
    button.style.setProperty('--depth', String(Math.round(y * 100)));
    const visual = element('span', 'garage-placement__visual');
    visual.append(sprite.picture);
    button.append(visual, name);
    if (debug) {
      button.classList.add('garage-placement--debug');
      name.textContent = `${surface} · ${item.name} · ${Math.round(artWidth * 100)}%`;
    }
    board.append(button);
  }
  if (debug) for (const [surface, x, y, width, height] of slots) {
    const marker = element('span', 'garage-placement__debug', surface);
    marker.style.cssText = `left:${x * 100}%;top:${y * 100}%;width:${width * 100}%;height:${height * 100}%`;
    board.append(marker);
  }
  overflow.hidden = hidden === 0;
  overflow.append(element('summary', '', `Ещё вещи · ${hidden}`), list);
  return overflow;
}
