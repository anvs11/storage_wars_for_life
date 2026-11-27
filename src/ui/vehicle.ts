import type { VehicleView } from '../game/stage5-contract';
import { personalCars } from '../game/personal-cars';
import type { PersonalCar } from '../game/personal-cars';
import { trailerCatalog, transportNames } from '../game/transport';
import type { Trailer } from '../game/transport';
import zhiguli from './assets/vehicle-zhiguli.png';
import van from './assets/vehicle-van.png';
import scooter from './assets/vehicle-scooter.webp';
import pickup from './assets/vehicle-pickup.webp';
import heavy from './assets/vehicle-heavy.webp';
import openTrailer from './assets/trailer-open.webp';
import highSideTrailer from './assets/trailer-high-side.webp';
import containerTrailer from './assets/trailer-container.webp';
import platformTrailer from './assets/trailer-platform.webp';
import reinforcedTrailer from './assets/trailer-reinforced.webp';
import mini from './assets/personal-mini.webp';
import q3 from './assets/personal-q3.webp';
import cayenne from './assets/personal-cayenne.webp';
import amg from './assets/personal-amg.webp';
import range from './assets/personal-range.webp';
import { element } from './dom';

export const vehicleName = transportNames;
const pictures = { zhiguli, van, scooter, pickup, heavy };
const trailers = [openTrailer, highSideTrailer, containerTrailer, platformTrailer, reinforcedTrailer] as const;
const personalPictures = { mini, q3, cayenne, amg, range };

export function personalCarPicture(car: PersonalCar): HTMLImageElement {
  const picture = element('img', '');
  picture.src = personalPictures[car];
  picture.alt = personalCars.find(({ id }) => id === car)!.name;
  picture.draggable = false;
  return picture;
}

export function vehiclePicture(model: VehicleView['model'], trailer?: VehicleView['trailer']): HTMLElement {
  const picture = element('img', '');
  picture.src = pictures[model];
  picture.alt = vehicleName[model];
  picture.draggable = false;
  if (trailer === undefined) return picture;
  const convoy = element('div', 'vehicle-convoy');
  const hitch = trailerPicture(trailer);
  convoy.append(picture, hitch);
  return convoy;
}

export function trailerPicture(trailer: Trailer): HTMLImageElement {
  const picture = element('img', '');
  picture.src = trailers[trailer];
  picture.alt = trailerCatalog[trailer].name;
  picture.draggable = false;
  return picture;
}
