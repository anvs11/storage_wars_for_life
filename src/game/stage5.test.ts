import { describe, expect, it } from 'vitest';
import { applyCommand as applyOld, newGame as oldGame } from './stage4-engine';
import type { Stage4Command } from './stage4-contract';
import type { Stage5Command } from './stage5-contract';
import { applyCommand, getView, newGame } from './stage5-engine';
import type { Stage5State } from './stage5-engine';
import { rubleEconomy } from './stage5-economy';
import { BACKUP_KEY, SAVE_KEY } from '../platform/save';
import { applySavedCommand, load, save } from '../platform/stage5-save';

type Action<C = Stage5Command> = C extends Stage5Command ? Omit<C, 'expectedRevision'> : never;
const send = (state: Stage5State, action: Action) =>
  applyCommand(state, { ...action, expectedRevision: state.base.game.revision });
const run = (start: Stage5State, ...commands: Action[]) => commands.reduce(send, start);

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

function sell(state: Stage5State, itemId: string, price: number): Stage5State {
  let next = run(state, { type: 'navigate', room: 'market' }, { type: 'publish', itemId, price },
    { type: 'navigate', room: 'inbox' });
  for (let waits = 0; waits < 20; waits += 1) {
    next = send(next, { type: 'waitForBuyer' });
    const listing = next.listings.find((entry) => entry.itemId === itemId);
    if (listing?.offer) return send(next, { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer.id });
  }
  throw new Error('No buyer offer');
}

function bought(): Stage5State {
  let state = send(newGame(64), { type: 'skipStory' });
  state = sell(state, 'home-kettle', 2000);
  state = sell(state, 'home-lamp', 750);
  state = sell(state, 'home-tools', 600);
  return run(state, { type: 'navigate', room: 'auctions' }, { type: 'enterAuction', tier: 'ordinary' },
    { type: 'bid' }, { type: 'bid' }, { type: 'openBox', boxId: 'box' });
}

describe('Stage 5', () => {
  it('открывает один гараж после полного пролога или пропуска и сохраняет каждый кадр', () => {
    const storage = memory();
    let staged = newGame(64);
    const skipped = send(staged, { type: 'skipStory' });
    for (const frame of ['eviction', 'rain', 'call', 'keys']) {
      expect(getView(staged)).toMatchObject({ frame, bank: 0 });
      expect(save(storage, staged)).toEqual({ ok: true });
      expect(load(storage)).toEqual({ kind: 'loaded', state: staged });
      staged = send(staged, { type: 'storyNext' });
    }
    expect(staged.items).toEqual(skipped.items);
    expect(staged.items).toHaveLength(3);
    expect(send(staged, { type: 'skipStory' })).toBe(staged);
  });

  it('резервирует объём, скрывает коробку и фиксирует прибыль только при продаже', () => {
    const state = bought();
    const loaded = memory();
    expect(getView(state)).toMatchObject({ phase: 'cargo', bank: 350, purchasePrice: 3000 });
    const bicycle = send(state, { type: 'toggleCargo', itemId: 'bicycle' });
    expect(getView(bicycle)).toMatchObject({ car: { used: 4, limit: 4 } });
    expect(send(bicycle, { type: 'toggleCargo', itemId: 'tool' })).toBe(bicycle);
    const replaced = run(bicycle, { type: 'toggleCargo', itemId: 'bicycle' }, { type: 'toggleCargo', itemId: 'tool' });
    expect(getView(replaced)).toMatchObject({ car: { used: 1 }, garage: { used: 1 } });
    expect(send(bicycle, { type: 'finishCargo', leaveRemaining: false })).toBe(bicycle);
    const garage = send(bicycle, { type: 'finishCargo', leaveRemaining: true });
    expect(garage.deals).toEqual([{ lotNumber: 1, cost: 3000, revenue: 0 }]);
    expect(garage.base.game.status).toBe(0);
    const item = garage.items[0]!;
    const waiting = run(garage, { type: 'navigate', room: 'market' },
      { type: 'publish', itemId: item.id, price: 100000 }, { type: 'waitForBuyer' });
    expect(waiting.listings[0]?.offer).toBeNull();
    expect(waiting.items).toHaveLength(1);
    for (const price of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(send(waiting, { type: 'publish', itemId: item.id, price })).toBe(waiting);
    }
    const resold = sell(waiting, item.id, 3500);
    expect(getView(resold)).toMatchObject({ phase: 'inbox', bank: 3850,
      garage: { used: 0 }, lastDeal: { receipt: { revenue: 3500, profit: 500 } } });
    expect(resold.base.game.status).toBe(2);
    expect(resold.deals).toHaveLength(0);
    expect(save(loaded, resold)).toEqual({ ok: true });
    expect(load(loaded)).toEqual({ kind: 'loaded', state: resold });
  });

  it('проверяет место дома отдельно от места в машине', () => {
    const state = bought();
    const oldItem = send(newGame(64), { type: 'skipStory' }).items[0]!;
    const full = { ...state, items: Array.from({ length: 5 }, (_, i) => ({ ...oldItem, id: String(i) })) };
    expect(getView(full)).toMatchObject({ phase: 'cargo', car: { used: 0 }, items: [{ id: 'bicycle', blocked: 'В гараже нет места.' }, { id: 'tool', blocked: null }] });
    expect(send(full, { type: 'toggleCargo', itemId: 'bicycle' })).toBe(full);
  });

  it('при нехватке одного рубля соперник выигрывает или игрок берёт оплачиваемый заказ', () => {
    const garage = send(newGame(64), { type: 'skipStory' });
    const poor = sell(garage, 'home-kettle', 1999);
    const job = run(poor, { type: 'navigate', room: 'auctions' }, { type: 'enterAuction', tier: 'ordinary' });
    expect(getView(job)).toMatchObject({ phase: 'job', bank: 1999, reward: 1 });
    expect(send(job, { type: 'claimJob' })).toBe(job);
    const wrong = send(job, { type: 'sortItem', station: 'shelf' });
    expect(getView(wrong)).toMatchObject({ completed: 0, incorrect: true });
    const inspection = run(wrong, { type: 'sortItem', station: 'floor' }, { type: 'sortItem', station: 'shelf' },
      { type: 'sortItem', station: 'recycle' }, { type: 'claimJob' });
    expect(getView(inspection)).toMatchObject({ phase: 'inspection', bank: 2000 });
    const rival = send(inspection, { type: 'bid' });
    expect(send(rival, { type: 'bid' })).toBe(rival);
    expect(getView(send(rival, { type: 'pass' }))).toMatchObject({ phase: 'result', bank: 2000, receipt: { outcome: 'passed' } });
  });

  it('повторяет платёж после ошибки записи и отклоняет повтор старой ревизии', () => {
    const storage = memory();
    const garage = send(newGame(64), { type: 'skipStory' });
    const offer = run(garage, { type: 'navigate', room: 'market' }, { type: 'publish', itemId: 'home-kettle', price: 2000 },
      { type: 'waitForBuyer' }, { type: 'navigate', room: 'inbox' });
    const listing = offer.listings[0]!;
    const command = { type: 'acceptOffer', listingId: listing.id, offerId: listing.offer!.id, expectedRevision: offer.base.game.revision } as const;
    expect(save(storage, offer)).toEqual({ ok: true });
    const fail = { ...storage, setItem: () => { throw new Error('write'); } };
    expect(applySavedCommand(fail, offer, command)).toMatchObject({ kind: 'failed', state: offer });
    const sold = applySavedCommand(storage, offer, command);
    expect(sold).toMatchObject({ kind: 'saved', state: { base: { game: { bank: 2000 } } } });
    expect(applySavedCommand(storage, sold.state, command)).toMatchObject({ kind: 'ignored' });
    storage.data.set(SAVE_KEY, '{');
    expect(load(storage)).toMatchObject({ kind: 'recovered', state: offer });
    expect(storage.data.has(BACKUP_KEY)).toBe(true);
  });

  it.each([1, 2, 3])('переносит v%i с активной ставкой и сохраняет её после обновления', (version) => {
    const storage = memory();
    const story = oldGame(64);
    const old = (state: typeof story, type: Stage4Command['type']) =>
      applyOld(state, { type, expectedRevision: state.game.revision } as Stage4Command);
    const bidding = old(old(story, 'skipStory'), 'bid');
    const { nextSeed: _next, offerSeeds: _offers, assets: _assets, ...stage2 } = bidding.game;
    const { tier: _tier, lotSeed: _lotSeed, ...v1 } = stage2 as typeof stage2 & { tier?: string; lotSeed?: number };
    storage.data.set(SAVE_KEY, JSON.stringify({ version, state: version === 3 ? bidding : version === 2 ? bidding.game : v1 }));
    const migrated = load(storage);
    expect(migrated.kind).toBe('loaded');
    if (migrated.kind !== 'loaded') return;
    expect(getView(migrated.state)).toMatchObject({ phase: 'bidding', bank: 10000, nextBidAmount: 3000 });
    const won = send(migrated.state, { type: 'bid' });
    expect(save(storage, won)).toEqual({ ok: true });
    expect(load(storage)).toEqual({ kind: 'loaded', state: won });
  });

  it('сохраняет старую частичную выручку и переводит цену встречи в новую шкалу', () => {
    const storage = memory();
    let previous = oldGame(64);
    for (const type of ['skipStory', 'bid', 'bid'] as const) {
      previous = applyOld(previous, { type, expectedRevision: previous.game.revision });
    }
    previous = applyOld(previous, { type: 'sellItem', itemId: 'bicycle', expectedRevision: previous.game.revision });
    storage.data.set(SAVE_KEY, JSON.stringify({ version: 3, state: previous }));
    const loaded = load(storage);
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;
    const view = getView(loaded.state);
    expect(view).toMatchObject({ phase: 'cargo', bank: 10500, revenue: 3500, purchasePrice: 3000, items: [] });
    const departed = send(loaded.state, { type: 'finishCargo', leaveRemaining: true });
    expect(departed.base.game.status).toBe(2);
    expect(departed.lastDeal?.receipt.profit).toBe(500);
    expect(save(storage, departed)).toEqual({ ok: true });
  });

  it('генерирует убыточные и прибыльные сделки, включая редкость за шесть цифр', () => {
    let highValue = 0;
    let profit = 0;
    let loss = 0;
    for (let seed = 0; seed < 150; seed += 1) {
      for (const tier of ['ordinary', 'selected', 'antique'] as const) {
        const lot = rubleEconomy.lot(tier, seed, 2);
        const items = [...lot.visibleFinds, ...lot.boxes.flatMap(({ contents }) => contents)];
        highValue = Math.max(highValue, ...items.map(({ salePrice }) => salePrice));
        const value = items.reduce((sum, { salePrice }) => sum + salePrice, 0);
        const bid = Math.max(lot.openingBid, ...lot.opponents.map(({ limit }) => rubleEconomy.advancePrice(limit)));
        if (value > bid) profit += 1;
        if (value < lot.openingBid) loss += 1;
      }
    }
    expect(highValue).toBeGreaterThanOrEqual(100000);
    expect(profit).toBeGreaterThan(0);
    expect(loss).toBeGreaterThan(0);
  });
});
