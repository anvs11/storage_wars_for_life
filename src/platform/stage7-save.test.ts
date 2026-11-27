import { expect, it } from 'vitest';
import { applyCommand as actStage2, newGame as newStage2 } from '../game/stage2-engine';
import { migrateStage2 } from '../game/stage3-engine';
import { applyCommand as actStage4, migrateStage3 } from '../game/stage4-engine';
import { rubleEconomy } from '../game/stage5-economy';
import { getView, migrateStage5, newGame } from '../game/stage7-engine';
import { newGame as newStage5 } from '../game/stage5-engine';
import type { Stage7Command, Stage7State } from '../game/stage7-engine';
import { BACKUP_KEY, SAVE_KEY, save as saveV1 } from './save';
import type { SaveStorage } from './save';
import { save as saveV2 } from './stage3-save';
import { save as saveV3 } from './stage4-save';
import { save as saveV5 } from './stage5-save';
import { applySavedCommand, load, save } from './stage7-save';

type Action<C = Stage7Command> = C extends Stage7Command ? Omit<C, 'expectedRevision'> : never;

function memory(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

function loadCurrent(storage: SaveStorage): Stage7State {
  const result = load(storage);
  if (result.kind !== 'loaded') throw new Error(`Не удалось загрузить профиль: ${result.kind}`);
  return result.state;
}

function commandFor(state: Stage7State, action: Action): Stage7Command {
  return { ...action, expectedRevision: getView(state).screen.revision };
}

function play(storage: SaveStorage, initial: Stage7State, ...actions: Action[]): Stage7State {
  let state = initial;
  for (const action of actions) {
    const result = applySavedCommand(storage, state, commandFor(state, action));
    expect(result.kind, action.type).toBe('saved');
    state = loadCurrent(storage);
    expect(state).toEqual(result.state);
  }
  return state;
}

function setup(storage: SaveStorage, bank = 0, status = 0, initial = newGame(64)): Stage7State {
  const starter = play(storage, initial, { type: 'skipStory' });
  const { base } = starter;
  const profile = base.base;
  if (profile.relationshipOpen || profile.game.phase !== 'hub') throw new Error('Ожидается стартовый гараж');
  const fixture = { ...starter, base: { ...base, base: { ...profile, game: { ...profile.game, bank, status } } } };
  expect(save(storage, fixture)).toEqual({ ok: true });
  return fixture;
}

it('обновляет старый нейтральный отзыв при загрузке и сохраняет отзыв с одной звездой', () => {
  const storage = memory();
  const state = setup(storage);
  const reviewer = { buyer: 'Яна', item: 'Настольная лампа' };
  const broken = { ...reviewer, stars: 1, text: 'Товар сломался сразу после покупки.' } as const;
  const old = { ...reviewer, stars: 3, text: 'Сделка состоялась, впечатление нейтральное.' } as const;
  expect(save(storage, { ...state, base: { ...state.base, reviews: [broken, old] } })).toEqual({ ok: true });
  expect(loadCurrent(storage).base.reviews).toEqual([broken,
    { ...reviewer, stars: 4, text: 'Всё работает, сделка прошла хорошо.' }]);
});

const home = { type: 'navigate', room: 'home' } as const;
const hub = { type: 'navigate', room: 'auctions' } as const;
const enter = { type: 'enterAuction', tier: 'ordinary' } as const;
const wait = { type: 'waitUntilNextPeriod' } as const;
const sleep = { type: 'sleep' } as const;
const wake = { type: 'wakeUp' } as const;
const openFlea = { type: 'openFleaVisit' } as const;
const confirmFlea = { type: 'confirmFleaVisit' } as const;
const restaurant = { type: 'spend', offerId: 'restaurant' } as const;

function fleaOffer(storage: SaveStorage, funds = 0, status = 0): Stage7State {
  const garage = setup(storage, funds, status);
  let state = play(storage, garage,
    ...['home-kettle', 'home-lamp', 'home-tools'].map((itemId) => ({ type: 'packForFlea', itemId }) as const), home);
  for (let day = 1; day < 6; day++) state = play(storage, state, wait, wait, wait, sleep, wake);
  return play(storage, state, openFlea);
}

it('читает v1–v3 и переводит деньги ровно один раз при продолжении старых торгов', () => {
  const tour = actStage2(newStage2(), { type: 'skipStory', expectedRevision: 0 });
  const bidding = actStage2(tour, { type: 'bid', expectedRevision: tour.revision });
  const v2 = migrateStage2(bidding);
  const writers = [
    (storage: SaveStorage) => saveV1(storage, bidding),
    (storage: SaveStorage) => saveV2(storage, v2),
    (storage: SaveStorage) => saveV3(storage, migrateStage3(v2)),
  ];
  for (const [index, write] of writers.entries()) {
    const storage = memory();
    expect(write(storage)).toEqual({ ok: true });
    const migrated = loadCurrent(storage);
    expect(getView(migrated)).toMatchObject({ screen: { phase: 'bidding', bank: 10000, nextBidAmount: 3000 },
      calendar: { day: 1, period: 'morning' }, familyDate: null, paidVisit: null, flea: { items: [] } });
    const homeAgain = play(storage, migrated, { type: 'pass' }, { type: 'nextLot' });
    expect(getView(homeAgain)).toMatchObject({ screen: { phase: 'home', bank: 10000 }, calendar: { period: 'afternoon' } });
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).version, `v${index + 1}`).toBe(8);
  }
});

it('сохраняет генератор открытого лота v4 до завершения выезда', () => {
  const storage = memory();
  const active = play(storage, setup(storage, 9000), hub, enter, { type: 'pass' }, { type: 'nextLot' }, hub);
  const { capacityUpgrades, baggageArrived, lotEdition: _edition, transport: _transport, ...legacy } = active.base;
  const game = actStage4(legacy.base, { type: 'enterAuction', tier: 'ordinary', expectedRevision: getView(active).screen.revision }, rubleEconomy);
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 4, state: { ...legacy, base: game } }));
  const migrated = loadCurrent(storage);
  expect(migrated.base.base).toEqual(game);
  expect(migrated.base.lotEdition).toBe(5);
  expect(migrated.calendar).toEqual({ day: 1, period: 'morning' });
  const next = play(storage, migrated, { type: 'pass' }, { type: 'nextLot' }, hub, enter);
  expect(next.base.lotEdition).toBe(6);
  expect(next.calendar.period).toBe('afternoon');
});

it('переносит профиль v5 с улучшением, откликом, открытой коробкой и выбранным грузом', () => {
  const storage = memory();
  const garage = setup(storage, 72000, 18, migrateStage5(newStage5(64)));
  const active = play(storage, garage, { type: 'buyCapacity', target: 'car' }, home, { type: 'buyHouse', level: 2 }, hub,
    { type: 'openRelationship' }, { type: 'meetNeighbor' }, { type: 'returnToHub' },
    { type: 'navigate', room: 'market' }, { type: 'publish', itemId: 'home-lamp', price: 750 }, { type: 'waitForBuyer' });
  const nextMorning = play(storage, active, home, wait, wait, sleep, wake, hub, enter, { type: 'bid' }, { type: 'bid' },
    { type: 'openBox', boxId: 'box' }, { type: 'toggleCargo', itemId: 'tool' });
  expect(nextMorning.base.listings[0]?.offer?.price).toBe(750);
  expect(saveV5(storage, nextMorning.base)).toEqual({ ok: true });
  const migrated = loadCurrent(storage);
  expect(migrated.base).toEqual(nextMorning.base);
  expect(getView(migrated)).toMatchObject({ screen: { phase: 'cargo', bank: 28000, boxes: [], car: { used: 1, limit: 8 } },
    calendar: { day: 1, period: 'morning' }, familyDate: { step: 'met', affection: 0, status: 23 }, flea: { items: [] } });
  const finished = play(storage, migrated, { type: 'finishCargo', leaveRemaining: true });
  expect(finished.base.items.some(({ id }) => id === 'owned-1-tool')).toBe(true);
  expect(finished.calendar.period).toBe('afternoon');
  expect(finished.base.base.game.assets).toEqual(['home']);
});

it('продолжает переговоры из inbox v5 и проводит одну продажу после обновления отклика', () => {
  const storage = memory();
  const inbox = play(storage, setup(storage, 0, 0, migrateStage5(newStage5(64))),
    { type: 'navigate', room: 'market' }, { type: 'publish', itemId: 'home-lamp', price: 750 },
    { type: 'navigate', room: 'inbox' });
  const listing = inbox.base.listings[0]!;
  const offer = listing.offer!;
  expect(offer.ceiling).toBeDefined();
  expect(saveV5(storage, inbox.base)).toEqual({ ok: true });
  const loaded = loadCurrent(storage);
  const view = getView(loaded);
  expect(view.screen.phase).toBe('inbox');
  expect(view.marketUnread).toBe(1);
  if (view.screen.phase !== 'inbox') throw new Error('Ожидается inbox');
  expect(view.screen.listings[0]?.offer).not.toHaveProperty('ceiling');
  const replied = play(storage, loaded, { type: 'readOffer', listingId: listing.id, offerId: offer.id },
    { type: 'messageBuyer', listingId: listing.id, offerId: offer.id, text: 'Договорились?' });
  const current = replied.base.listings[0]!.offer!;
  expect(current.id).not.toBe(offer.id);
  expect(applySavedCommand(storage, replied,
    commandFor(replied, { type: 'acceptOffer', listingId: listing.id, offerId: offer.id })).kind).toBe('ignored');
  const sale = { type: 'acceptOffer', listingId: listing.id, offerId: current.id } as const;
  const sold = play(storage, replied, sale);
  expect(getView(sold).screen.bank).toBe(current.price);
  expect(sold.base.items.some(item => item.id === listing.itemId)).toBe(false);
  expect(sold.base.listings).toEqual([]);
  expect(sold.base.reviews).toHaveLength(1);
  expect(applySavedCommand(storage, sold, commandFor(sold, sale)).kind).toBe('ignored');
});

it('восстанавливает оплаченный чемодан v5 и разбирает его без расхода выезда', () => {
  const storage = memory();
  const bag = play(storage, setup(storage, 3000), hub, { type: 'callAirport' }, { type: 'buyBaggage' });
  expect(saveV5(storage, bag.base)).toEqual({ ok: true });
  const restored = loadCurrent(storage);
  expect(getView(restored)).toMatchObject({ screen: { phase: 'baggageArrival', bank: 600 }, calendar: { period: 'morning' } });
  const garage = play(storage, restored, { type: 'receiveBaggage' }, { type: 'openBox', boxId: 'suitcase' },
    { type: 'toggleFleaBaggage', itemId: 'suitcase-find' }, { type: 'finishCargo', leaveRemaining: false });
  expect(garage.flea.items).toHaveLength(1);
  expect(getView(garage)).toMatchObject({ screen: { bank: 600 }, calendar: { period: 'morning', remainingOutings: 3 } });
});

it.each([
  ['барахолка', SAVE_KEY, confirmFlea], ['барахолка', BACKUP_KEY, confirmFlea],
  ['ресторан', SAVE_KEY, restaurant], ['ресторан', BACKUP_KEY, restaurant],
] as const)('на операции %s переживает отказ записи в %s', (_label, blockedKey, action) => {
  const storage = memory();
  const before = action.type === 'confirmFleaVisit' ? fleaOffer(storage) : play(storage, setup(storage, 3000, 18), hub);
  const command = commandFor(before, action);
  const primary = storage.getItem(SAVE_KEY);
  const locked: SaveStorage = { ...storage, setItem(key, value) {
    if (key === blockedKey) throw new Error('Хранилище занято');
    storage.setItem(key, value);
  } };
  expect(applySavedCommand(locked, before, command)).toMatchObject({ kind: 'failed', state: before, message: expect.stringMatching(/Повторите действие/) });
  expect(storage.getItem(SAVE_KEY)).toBe(primary);
  const restored = loadCurrent(storage);
  expect(restored).toEqual(before);
  const committed = play(storage, restored, action);
  expect(getView(committed)).toMatchObject({ screen: { bank: action.type === 'confirmFleaVisit' ? 1996 : 400 },
    calendar: { period: 'afternoon', remainingOutings: 2 } });
  expect(applySavedCommand(locked, committed, command)).toEqual({ kind: 'ignored', state: committed });
  expect(loadCurrent(storage)).toEqual(committed);
});

it('отклоняет сохранение с невозможным временем, неверной выручкой или двумя владельцами одного ID', () => {
  const storage = memory();
  const offer = fleaOffer(storage);
  const sold = play(storage, offer, confirmFlea);
  const receipt = sold.flea.visit;
  if (receipt?.phase !== 'receipt') throw new Error('Ожидается рыночная квитанция');
  const pending = offer.flea.items[0]!;
  const soldLine = receipt.sold[0]!;
  for (const invalid of [
    { ...offer, calendar: { day: 13, period: 'morning' } },
    { ...offer, calendar: { day: 6, period: 'afternoon' } },
    { ...offer, base: { ...offer.base, items: [pending] } },
    { ...offer, base: { ...offer.base, listings: [{ id: 'foreign', itemId: pending.id, price: 1, offer: null }] } },
    { ...sold, flea: { ...sold.flea, visit: { ...receipt, revenue: receipt.revenue + 1 } } },
    { ...sold, flea: { ...sold.flea, visit: { ...receipt, bankBefore: 1 } } },
    { ...sold, flea: { ...sold.flea, visit: { ...receipt, sold: [{ ...soldLine, size: 4 }, ...receipt.sold.slice(1)] } } },
    { ...sold, flea: { ...sold.flea, items: [...sold.flea.items, pending] } },
  ]) {
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: invalid }));
    expect(load(storage)).toEqual({ kind: 'recovered', state: offer, message: 'Восстановлено предыдущее сохранение.' });
  }
  const { bankBefore, ...old } = receipt;
  const legacyReceipt = { ...old, sold: old.sold.map(({ size, ...item }) => item) };
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 6, state: { ...sold, flea: { ...sold.flea, visit: legacyReceipt } } }));
  expect(load(storage)).toMatchObject({ kind: 'loaded', state: { flea: { visit: legacyReceipt } } });
});

it('оставляет прежний экран и банк при отказе проверки новой ревизии', () => {
  const storage = memory();
  const before = play(storage, setup(storage, 3000, Number.MAX_SAFE_INTEGER), hub);
  const original = storage.getItem(SAVE_KEY);
  const command = commandFor(before, restaurant);
  expect(applySavedCommand(storage, before, command)).toMatchObject({ kind: 'failed', state: before });
  expect(storage.getItem(SAVE_KEY)).toBe(original);
  expect(loadCurrent(storage)).toEqual(before);
});
