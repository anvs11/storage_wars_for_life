import kettle from './assets/scene-kettle.png';
import lamp from './assets/scene-lamp.png';
import spanners from './assets/scene-spanners.png';
import box from './assets/scene-box.png';
import screen from './assets/scene-screen.png';
import drill from './assets/scene-drill.png';
import vise from './assets/scene-vise.png';
import level from './assets/scene-level.png';
import wrench from './assets/scene-wrench.png';
import toolbox from './assets/scene-toolbox.png';
import bicycle from './assets/scene-bicycle.png';
import glass from './assets/scene-glass.png';
import openTools from './assets/scene-open-tools.png';
import boxes from './assets/scene-stacked-boxes.png';

import radio from './assets/scene-radio.png';
import camera from './assets/scene-camera.png';
import speaker from './assets/scene-speaker.png';
import amplifier from './assets/scene-amplifier.png';
import turntable from './assets/scene-turntable.png';
import floorlamp from './assets/scene-floorlamp.png';
import sewing from './assets/scene-sewing.png';
import trunk from './assets/scene-trunk.png';
import vase from './assets/scene-vase.png';
import tableware from './assets/scene-tableware.png';
import clock from './assets/scene-clock.png';
import candlestick from './assets/scene-candlestick.png';

const artwork: readonly [RegExp, string][] = [
  [/чайник/i, kettle], [/настольная лампа/i, lamp], [/набор гаечных ключей/i, spanners],
  [/ящик для инструментов/i, toolbox], [/закрытая коробка/i, box], [/за ширмой/i, screen], [/дрель/i, drill],
  [/тиски/i, vise], [/строительный уровень/i, level], [/разводной ключ/i, wrench],
  [/радиоприёмник/i, radio], [/фотоаппарат/i, camera], [/колонка/i, speaker], [/усилитель/i, amplifier],
  [/проигрыватель/i, turntable], [/напольный светильник/i, floorlamp], [/швейная машина/i, sewing], [/сундук/i, trunk],
  [/ваза/i, vase], [/сервиз|расписная керамика/i, tableware], [/часы/i, clock], [/подсвечник/i, candlestick],
  [/велосипед/i, bicycle], [/защитное стекло/i, glass], [/инструмент из коробки/i, openTools],
];

function sprite(src: string): HTMLImageElement {
  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.draggable = false;
  return image;
}

export function sceneSprite(name: string): HTMLImageElement | null {
  const src = artwork.find(([pattern]) => pattern.test(name))?.[1];
  return src ? sprite(src) : null;
}

// Normalized opaque bounds measured from the square PNGs at alpha >= 36.
const opaqueBounds = new Map<string, readonly [number, number, number, number]>([
  [amplifier, [0.026, 0.315, 0.974, 0.759]],
  [bicycle, [0.019, 0, 0.997, 1]],
  [box, [0.071, 0.15, 0.913, 0.913]],
  [camera, [0.086, 0.194, 0.935, 0.897]],
  [candlestick, [0.267, 0.056, 0.728, 0.935]],
  [clock, [0.026, 0.19, 0.974, 0.849]],
  [drill, [0.129, 0.075, 0.9, 0.946]],
  [floorlamp, [0.323, 0.039, 0.685, 0.957]],
  [glass, [0.034, 0.281, 0.969, 1]],
  [kettle, [0.221, 0.129, 0.879, 0.929]],
  [lamp, [0.071, 0.038, 0.896, 0.946]],
  [level, [0.029, 0.275, 0.975, 0.754]],
  [openTools, [0.084, 0, 0.934, 1]],
  [radio, [0.043, 0.194, 0.957, 0.918]],
  [screen, [0.017, 0.05, 0.983, 0.942]],
  [sewing, [0.022, 0.151, 0.94, 0.897]],
  [spanners, [0.079, 0.079, 0.875, 0.929]],
  [speaker, [0.233, 0.06, 0.784, 0.961]],
  [boxes, [0.053, 0, 0.897, 0.95]],
  [tableware, [0.017, 0.121, 0.983, 0.841]],
  [toolbox, [0.025, 0.183, 0.975, 0.858]],
  [trunk, [0.039, 0.172, 0.966, 0.832]],
  [turntable, [0.043, 0.091, 0.966, 0.909]],
  [vase, [0.284, 0.039, 0.716, 0.961]],
  [vise, [0.025, 0.171, 0.954, 0.896]],
  [wrench, [0.063, 0.054, 0.875, 0.967]],
]);

export function garageSprite(name: string) {
  const src = artwork.find(([pattern]) => pattern.test(name))?.[1];
  const bounds = src === undefined ? undefined : opaqueBounds.get(src);
  return src && bounds ? { picture: sprite(src), bounds } : null;
}

export function stackedBoxes(): HTMLImageElement {
  const image = sprite(boxes);
  image.className = 'scene-box-stack';
  return image;
}

export function placeProp(node: HTMLElement, name: string, index: number, contained: boolean, revealed = false): void {
  const slot = contained ? 'container' : 'find';
  node.classList.add(`scene-prop--${slot}-${index}`);
  if (revealed) node.classList.add('scene-prop--revealed');
  if (/за ширмой/i.test(name)) node.classList.add('scene-prop--screen');
  if (/уровень|разводной ключ/i.test(name)) node.classList.add('scene-prop--slim');
  if (/защитное стекло/i.test(name)) node.classList.add('scene-prop--small');
}
