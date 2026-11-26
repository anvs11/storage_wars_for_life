import { expect, it } from 'vitest';
import { applyCommand, getView, newGame } from './stage5-engine';
import type { Stage5State } from './stage5-engine';
import type { Stage5Command } from './stage5-contract';
import { rubleEconomy } from './stage5-economy';
import { generateStage6Lot } from './stage6-auctions';
import { load, save } from '../platform/stage5-save';
import { SAVE_KEY } from '../platform/save';

type Action<C = Stage5Command> = C extends Stage5Command ? Omit<C, 'expectedRevision'> : never;
const send = (state: Stage5State, action: Action) =>
  applyCommand(state, { ...action, expectedRevision: state.base.game.revision });
const run = (state: Stage5State, ...actions: Action[]) => actions.reduce(send, state);

function garage(bank = 50000): Stage5State {
  const state = send(newGame(64), { type: 'skipStory' });
  return { ...state, base: { ...state.base, relationshipOpen: false, game: { ...state.base.game, bank } } };
}

function storefront() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function reload(state: Stage5State): Stage5State {
  const storage = storefront();
  expect(save(storage, state)).toEqual({ ok: true });
  const saved = load(storage);
  expect(saved.kind).toBe('loaded');
  if (saved.kind !== 'loaded') throw new Error('Снимок не загрузился.');
  return saved.state;
}

it('покупает вместимость один раз, сохраняет её и позволяет взять обе учебные находки', () => {
  const initial = garage();
  const upgraded = reload(run(initial, { type: 'buyCapacity', target: 'garage' }, { type: 'buyCapacity', target: 'car' }));
  expect(getView(upgraded)).toMatchObject({ bank: 21000, garage: { limit: 16 },
    upgrades: [{ target: 'shelves', current: 16, next: 24, available: false }] });
  expect(send(upgraded, { type: 'buyCapacity', target: 'car' })).toBe(upgraded);
  const cargo = run(upgraded, { type: 'navigate', room: 'auctions' }, { type: 'enterAuction', tier: 'ordinary' },
    { type: 'bid' }, { type: 'bid' }, { type: 'openBox', boxId: 'box' },
    { type: 'toggleCargo', itemId: 'bicycle' }, { type: 'toggleCargo', itemId: 'tool' });
  expect(getView(reload(cargo))).toMatchObject({ car: { used: 5, limit: 8 }, garage: { used: 8, limit: 16 } });
});

it('учитывает ремонт в прибыли, аннулирует прежний отклик и принимает сделку разово', () => {
  const initial = garage();
  const kettle = { ...initial.items[0]!, name: 'Сломанный чайник', value: 300, estimate: { min: 150, max: 400 },
    condition: 'damaged' as const, lotNumber: 1 };
  if (initial.base.game.phase !== 'hub') throw new Error();
  let state: Stage5State = {
    ...initial, items: [kettle], deals: [{ lotNumber: 1, cost: 1000, revenue: 0 }],
    base: { ...initial.base, relationshipOpen: false, game: { ...initial.base.game, lotNumber: 1 } },
  };
  state = run(state, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: kettle.id, price: 300 },
    { type: 'waitForBuyer' }, { type: 'navigate', room: 'garage' }, { type: 'repairItem', itemId: kettle.id });
  expect(state.listings).toHaveLength(0);
  expect(state.base.game.bank).toBe(49500);
  expect(state.items[0]?.condition).toBe('good');
  expect(send(state, { type: 'repairItem', itemId: kettle.id })).toBe(state);
  state = reload(run(state, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: kettle.id, price: 5000 },
    { type: 'navigate', room: 'inbox' }));
  for (let i = 0; i < 60 && !state.listings[0]?.offer; i += 1) state = send(state, { type: 'waitForBuyer' });
  const listing = state.listings[0]!;
  const offer = listing.offer!;
  expect(offer.price).toBeLessThan(5000);
  const market = send(state, { type: 'navigate', room: 'market' });
  const cancelled = send(market, { type: 'cancelListing', listingId: listing.id });
  expect(cancelled.listings).toHaveLength(0);
  expect(cancelled.items).toEqual(market.items);
  expect(cancelled.base.game.bank).toBe(market.base.game.bank);
  state = send(state, { type: 'counterOffer', listingId: listing.id, offerId: offer.id, price: offer.price + 1 });
  const reply = state.listings[0]!.offer!;
  expect(reply.countered).toBe(true);
  expect(send(state, { type: 'acceptOffer', listingId: listing.id, offerId: offer.id })).toBe(state);
  const sold = reload(send(state, { type: 'acceptOffer', listingId: listing.id, offerId: reply.id }));
  expect(sold.lastDeal).toMatchObject({ repairCost: 500, receipt: { purchasePrice: 1500, profit: reply.price - 1500 } });
  expect(sold.items).toHaveLength(0);
  expect(sold.listings).toHaveLength(0);
});

it('хранит оплаченный багаж, раскрывает его после получения и завершает доставку по объявлению', () => {
  let state = run(garage(), { type: 'navigate', room: 'auctions' }, { type: 'callAirport' }, { type: 'buyBaggage' });
  expect(getView(reload(state))).toMatchObject({ phase: 'baggageArrival', bank: 47600 });
  expect(send(state, { type: 'openBox', boxId: 'suitcase' })).toBe(state);
  state = reload(send(state, { type: 'receiveBaggage' }));
  expect(getView(state)).toMatchObject({ phase: 'cargo', baggage: true, items: [], boxes: [{ id: 'suitcase' }] });
  state = reload(run(state, { type: 'openBox', boxId: 'suitcase' }, { type: 'toggleCargo', itemId: 'suitcase-find' },
    { type: 'finishCargo', leaveRemaining: false }));
  expect(state.base.game.bank).toBe(47600);
  const item = state.items.find(({ baggageId }) => baggageId)!;
  state = run(state, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: item.id, price: 300 },
    { type: 'navigate', room: 'inbox' });
  for (let i = 0; i < 80 && !state.listings[0]?.offer?.delivery; i += 1) state = send(state, { type: 'waitForBuyer' });
  const listing = state.listings[0]!;
  expect(listing.offer).toMatchObject({ delivery: true, price: 300 });
  const action = { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer!.id } as const;
  state = reload(send(state, action));
  expect(state.base.game.bank).toBe(47900);
  expect(state.lastDeal?.receipt.profit).toBe(-2100);
  expect(state.base.game.status).toBe(0);
  expect(send(state, action)).toBe(state);
});

it('продолжает открытый процедурный лот v4 по исходному генератору', () => {
  const state = run(garage(), { type: 'navigate', room: 'auctions' }, { type: 'enterAuction', tier: 'ordinary' });
  const game = state.base.game;
  if (game.phase !== 'inspection') throw new Error();
  const oldLot = rubleEconomy.lot('ordinary', 723, 2);
  const { lotEdition: _edition, capacityUpgrades: _upgrades, baggageArrived: _arrived, ...legacy } = state;
  const storage = storefront();
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 4, state: { ...legacy, base: { ...state.base, game: {
      ...game, lotNumber: 2, lot: oldLot, lotSeed: 723, activeOpponentIds: oldLot.opponents.map(({ id }) => id),
    } } },
  }));
  const restored = load(storage);
  expect(restored.kind).toBe('loaded');
  if (restored.kind !== 'loaded') throw new Error();
  expect(restored.state.lotEdition).toBe(5);
  expect(getView(restored.state)).toMatchObject({ nextBidAmount: oldLot.openingBid });
  const toured = reload(run(restored.state, { type: 'pass' }, { type: 'nextLot' }, { type: 'navigate', room: 'auctions' },
    { type: 'enterAuction', tier: 'ordinary' }));
  expect(toured.lotEdition).toBe(6);
});

it('скрывает содержимое за ширмой и резервирует отдельное место для украшения', () => {
  const state = garage(1000000);
  const game = state.base.game;
  if (game.phase !== 'hub') throw new Error();
  const seed = Array.from({ length: 10000 }, (_, index) => index).find((candidate) =>
    generateStage6Lot('ordinary', candidate, 2).boxes.some((box) => box.name === 'Вещи за ширмой' &&
      box.contents.some((item) => 'storage' in item && item.storage === 'jewelryBox')));
  if (seed === undefined) throw new Error('Не найден контрольный лот.');
  const lot = generateStage6Lot('ordinary', seed, 2);
  const box = lot.boxes.find((entry) => entry.name === 'Вещи за ширмой')!;
  const jewel = box.contents.find((item) => 'storage' in item && item.storage === 'jewelryBox')!;
  let active = run({
    ...state, base: { ...state.base, relationshipOpen: false, game: {
      ...game, lotNumber: 1, offerSeeds: { ...game.offerSeeds, ordinary: seed },
    } },
  }, { type: 'navigate', room: 'auctions' }, { type: 'enterAuction', tier: 'ordinary' });
  expect(JSON.stringify(getView(active))).not.toContain(jewel.name);
  while (active.base.game.phase === 'inspection' || active.base.game.phase === 'bidding') {
    const next = send(active, { type: 'bid' });
    if (next === active) throw new Error('Ставка не принята.');
    active = next;
  }
  expect(JSON.stringify(getView(active))).not.toContain(jewel.name);
  const selected = reload(run(active, { type: 'openBox', boxId: box.id }, { type: 'toggleCargo', itemId: jewel.id }));
  expect(getView(selected)).toMatchObject({ car: { used: 1 }, garage: { used: 3 }, jewelry: { used: 1, limit: 4 } });
  const packed = reload(send(selected, { type: 'finishCargo', leaveRemaining: true }));
  expect(packed.items).toContainEqual(expect.objectContaining({ name: jewel.name, position: 'jewelryBox' }));
});
