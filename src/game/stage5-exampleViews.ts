import type { GarageItemView, Stage5View } from './stage5-contract';

const kettle: GarageItemView = {
  id: 'kettle', name: 'Электрический чайник с металлическим корпусом и целой подставкой',
  size: 1, position: 'shelf', condition: 'good', clue: 'Крышка и провод целы.', estimate: { min: 1600, max: 2300 },
};
const garage = { used: 1, limit: 8 };
const room = {
  phase: 'garage', revision: 5, bank: 300, items: [kettle], listings: [],
  unread: 0, garage, lastSale: null, lastDeal: null, deals: [],
} as const;
const waiting = { id: 'ad-1', itemId: kettle.id, price: 2000, offer: null };
const offer = { id: 'offer-1', buyer: 'Ирина', price: 2000, unread: true };
const cargo = {
  phase: 'cargo', sceneId: 'workshop', lotNumber: 1, revision: 26, bank: 100,
  purchasePrice: 3000, revenue: 0, car: { used: 4, limit: 4 }, garage,
  boxes: [{ id: 'box-1', name: 'Закрытая коробка' }],
  items: [{ ...kettle, selected: false, blocked: 'В машине нет места.' }],
} as const;

export const stage5Views = {
  newProfile: { phase: 'opening', frame: 'eviction', bank: 0, revision: 0 },
  garageFull: { ...room, garage: { used: 8, limit: 8 } },
  cargoFull: cargo,
  lastSlot: { ...cargo, car: { used: 3, limit: 4 }, items: [{ ...kettle, selected: false, blocked: null }] },
  listingWaiting: { ...room, phase: 'market', listings: [waiting] },
  newOffer: { ...room, phase: 'inbox', listings: [{ ...waiting, offer }], unread: 1 },
  readOffer: { ...room, phase: 'inbox', listings: [{ ...waiting, offer: { ...offer, unread: false } }] },
  sold: { ...room, phase: 'market', bank: 100000, items: [], garage: { used: 0, limit: 8 }, lastSale: { name: kettle.name, price: 2000 } },
  recovery: { phase: 'job', bank: 1999, revision: 20, minimumBid: 2000, reward: 1, task: 'Велосипед', total: 3, completed: 0, incorrect: false },
} as const satisfies Record<string, Stage5View>;
