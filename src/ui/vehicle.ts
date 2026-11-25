import type { VehicleView } from '../game/stage5-contract';
import zhiguli from './assets/vehicle-zhiguli.png';
import van from './assets/vehicle-van.png';
import { element } from './dom';

export const vehicleName: Record<VehicleView['model'], string> = {
  zhiguli: 'Жигули ВАЗ-2107', van: 'Грузовой фургон',
};
const pictures = { zhiguli, van };

export function vehiclePicture(model: VehicleView['model']): HTMLImageElement {
  const picture = element('img', '');
  picture.src = pictures[model];
  picture.alt = vehicleName[model];
  picture.draggable = false;
  return picture;
}
