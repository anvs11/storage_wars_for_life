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
