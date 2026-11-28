import type { GarageItemView } from '../game/stage5-contract';
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

export function placeGarageItems(board: HTMLElement, items: readonly GarageItemView[],
  inspect: (item: GarageItemView, source: HTMLElement) => void, level = 1, outside = false): HTMLElement {
  const slots: Slot[] = level === 1 ? [...builtInSlots] : [];
  if (outside) {
    const gate = [.72, .75, .68, .74, .70][level - 1]!;
    slots.splice(0, slots.length, ['oversize', gate, .84, .30, .25], ['oversize', gate - .30, .90, .33, .28]);
  } else if (level > 1) {
    // Contact lines measured against each empty interior, normalized to the photograph.
    const shelfY = [[.39,.51,.62], [.34,.46,.57], [.36,.46,.55], [.40,.48,.56]][level - 2]!;
    for (const [row, surface] of (['upper','middle','lower'] as const).entries()) {
      for (const x of [.065,.165]) slots.push([surface, x, shelfY[row]!, .09, .115]);
    }
    slots.push(['bench', .82, [.52,.55,.51,.54][level - 2]!, .13,.14],
      ['bench', .945, [.55,.58,.54,.56][level - 2]!, .10,.13], ...builtInSlots.filter(s => s[0] === 'floor' || s[0] === 'oversize'));
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
    const artWidth = Math.min(maxWidth / bboxWidth, maxHeight / (bboxHeight * 1.5 / sprite.aspect));
    button.classList.add('garage-placement');
    button.style.setProperty('--x', `${x * 100}%`);
    button.style.setProperty('--y', `${y * 100}%`);
    button.style.setProperty('--w', `${artWidth * bboxWidth * 100}%`);
    button.style.setProperty('--h', `${artWidth * bboxHeight * 150 / sprite.aspect}%`);
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
