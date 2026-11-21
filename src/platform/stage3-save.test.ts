import { describe, expect, it } from 'vitest';
import { openingBidFor } from '../game/repeat-auctions';
import { applyCommand as applyLegacy, newGame as newLegacyGame } from '../game/stage2-engine';
import type { Stage2State } from '../game/stage2-engine';
import type { Stage2Command } from '../game/stage2-contract';
import { getView } from '../game/stage3-engine';
import type { Stage3State } from '../game/stage3-engine';
import { accepted, act, hub } from '../game/stage3-test-support';
import type { Action } from '../game/stage3-test-support';
import { BACKUP_KEY, SAVE_KEY, save as legacySave } from './save';
import type { SaveStorage } from './save';
import { applySavedCommand, load, save } from './stage3-save';

function memoryStorage(): SaveStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
}

function roundTrip(storage: SaveStorage, expected: Stage3State): Stage3State {
  const restored = load(storage);
  if (restored.kind !== 'loaded') throw new Error(`Не удалось загрузить сохранение: ${restored.kind}`);
  expect(restored.state).toEqual(expected);
  expect(getView(restored.state)).toEqual(getView(expected));
  return restored.state;
}

function perform(storage: SaveStorage, state: Stage3State, action: Action): Stage3State {
  const next = applySavedCommand(storage, state, { ...action, expectedRevision: state.revision });
  expect(next.kind).toBe('saved');
  return roundTrip(storage, next.state);
}

function legacyStep(
  state: Stage2State, type: Exclude<Stage2Command['type'], 'inspect' | 'openBox' | 'sellItem'>,
): Stage2State {
  return applyLegacy(state, { type, expectedRevision: state.revision });
}

describe('сохранения Stage 3', () => {
  it('мигрирует все фазы Stage 2 и продолжает старые лоты с исходным шагом', () => {
    const start = newLegacyGame();
    const dialogue = legacyStep(legacyStep(start, 'storyNext'), 'storyNext');
    const active = applyLegacy(legacyStep(start, 'skipStory'), { type: 'inspect', itemId: 'bicycle', expectedRevision: 1 });
    const bidding = legacyStep(active, 'bid');
    const bought = legacyStep(bidding, 'bid');
    const partial = applyLegacy(bought, { type: 'sellItem', itemId: 'bicycle', expectedRevision: bought.revision });
    const opened = applyLegacy(partial, { type: 'openBox', boxId: 'box', expectedRevision: partial.revision });
    const sold = legacyStep(opened, 'sellAll');
    const passed = legacyStep(bidding, 'pass');
    const recovery = legacyStep({ ...sold, bank: 19 }, 'nextLot');

    const workshop = legacyStep(sold, 'nextLot');
    const workshopBid = legacyStep(legacyStep(legacyStep(workshop, 'bid'), 'bid'), 'bid');
    const examples = [dialogue, active, bidding, bought, partial, opened, sold, passed, recovery, workshopBid];
    for (const original of examples) {
      const storage = memoryStorage();
      expect(legacySave(storage, original)).toEqual({ ok: true });
      const migrated = load(storage);
      if (migrated.kind !== 'loaded') throw new Error('Не удалось загрузить Stage 2');
      expect(migrated.state).toMatchObject({ ...original, assets: [] });
      expect(load(storage)).toEqual(migrated);
      if (original.phase !== 'prologue') {
        expect(migrated.state).toMatchObject({ tier: 'ordinary', lotSeed: null });
      }
      if (original === workshopBid) {
        expect(getView(migrated.state)).toMatchObject({ currentPrice: 55, nextBidAmount: 60 });
        const next = perform(storage, migrated.state, { type: 'bid' });
        expect(next).toMatchObject({ phase: 'reveal', purchasePrice: 60, bank: 55 });
      } else {
        expect(save(storage, migrated.state)).toEqual({ ok: true });
      }
      expect(JSON.parse(storage.getItem(SAVE_KEY)!).version).toBe(2);
    }
  });

  it('восстанавливает резервный снимок v1 и продолжает частичную продажу без второй выплаты', () => {
    const storage = memoryStorage();
    const bought = legacyStep(legacyStep(legacyStep(newLegacyGame(), 'skipStory'), 'bid'), 'bid');
    const partial = applyLegacy(bought, { type: 'sellItem', itemId: 'bicycle', expectedRevision: bought.revision });
    expect(legacySave(storage, partial)).toEqual({ ok: true });
    const old = storage.getItem(SAVE_KEY)!;
    storage.setItem(BACKUP_KEY, old);
    storage.setItem(SAVE_KEY, '{');
    const recovered = load(storage);
    if (recovered.kind !== 'recovered') throw new Error('Ожидается восстановление Stage 2');
    expect(recovered.message).toMatch(/предыдущее/);
    expect(act(recovered.state, { type: 'sellItem', itemId: 'bicycle' })).toBe(recovered.state);
    const opened = perform(storage, recovered.state, { type: 'openBox', boxId: 'box' });
    expect(storage.getItem(BACKUP_KEY)).toBe(old);
    const sold = perform(storage, opened, { type: 'sellItem', itemId: 'tool' });
    expect(sold).toMatchObject({ bank: 115, status: 2 });
    expect(act(sold, { type: 'sellAll' })).toBe(sold);
  });

  it.each([20, 25])('после перезагрузки объявленная ставка $%i совпадает с первой при банке $22', (openingBid) => {
    const storage = memoryStorage();
    let seed = 0;
    while (openingBidFor('ordinary', seed) !== openingBid) seed += 1;
    const start = hub(17);
    const low = { ...start, bank: 22, offerSeeds: { ...start.offerSeeds, ordinary: seed } };
    expect(save(storage, low)).toEqual({ ok: true });
    const restored = roundTrip(storage, low);
    expect(getView(restored)).toMatchObject({ auctions: [{ openingBid }, {}, {}] });
    let current = perform(storage, restored, { type: 'enterAuction', tier: 'ordinary' });
    if (openingBid === 25) {
      expect(getView(current)).toMatchObject({ phase: 'recovery', minimumBid: 25, reward: 3 });
      current = perform(storage, current, { type: 'sortGarage' });
      expect(act(current, { type: 'sortGarage' })).toBe(current);
    }
    expect(getView(current)).toMatchObject({ phase: 'inspection', nextBidAmount: openingBid });
    const afterBid = perform(storage, current, { type: 'bid' });
    expect(afterBid).toEqual(accepted(current, { type: 'bid' }));
  });

  it('перезагружает активный новый лот и повторяет выбор после отказа записи с тем же seed', () => {
    const storage = memoryStorage();
    const start = { ...hub(91), bank: 180, status: 18 };
    expect(save(storage, start)).toEqual({ ok: true });
    const command = { type: 'enterAuction', tier: 'selected', expectedRevision: start.revision } as const;
    const locked: SaveStorage = {
      getItem: storage.getItem,
      setItem(key, value) {
        if (key === SAVE_KEY) throw new Error('Хранилище заблокировано');
        storage.setItem(key, value);
      },
    };
    const failure = applySavedCommand(locked, start, command);
    expect(failure.kind).toBe('failed');
    expect(failure.state).toBe(start);
    const restored = roundTrip(storage, start);
    const inspection = perform(storage, restored, command);
    expect(inspection).toEqual(accepted(start, command));
    expect(inspection).toMatchObject({ lotSeed: start.offerSeeds.selected });
    expect(inspection.nextSeed).not.toBe(start.nextSeed);
    expect(applySavedCommand(storage, inspection, command).kind).toBe('ignored');
    const bidding = perform(storage, inspection, { type: 'bid' });
    expect(bidding).toEqual(accepted(inspection, { type: 'bid' }));
    let result = bidding;
    while (result.phase === 'bidding') result = perform(storage, result, { type: 'bid' });
    if (result.phase !== 'reveal') throw new Error('Ожидается покупка');
    expect(result.lot).toEqual('lot' in inspection ? inspection.lot : null);
    const firstBox = result.lot.boxes[0]!;
    const opened = perform(storage, result, { type: 'openBox', boxId: firstBox.id });
    expect(opened).toMatchObject({ openedBoxIds: [firstBox.id], bank: result.bank });
  });

  it.each([[0, 4, 79], [2, 25, 100], [1, 60, 135]])('сохраняет багаж с seed %i и выручкой $%i после повторной загрузки', (seed, price, bank) => {
    const storage = memoryStorage();
    const start = hub(seed);
    const airport = perform(storage, start, { type: 'callAirport' });
    const command = { type: 'buyBaggage', expectedRevision: airport.revision } as const;
    const locked: SaveStorage = {
      getItem: storage.getItem,
      setItem(key, value) {
        if (key === SAVE_KEY) throw new Error('Хранилище заблокировано');
        storage.setItem(key, value);
      },
    };
    const failed = applySavedCommand(locked, airport, command);
    expect(failed.kind).toBe('failed');
    expect(failed.state).toBe(airport);
    const bought = perform(storage, roundTrip(storage, airport), command);
    expect(bought).toEqual(accepted(airport, command));
    expect(getView(bought)).toMatchObject({ bank: 75, revealedFinds: [] });
    expect(applySavedCommand(storage, bought, command).kind).toBe('ignored');
    const opened = perform(storage, bought, { type: 'openBox', boxId: 'suitcase' });
    expect(getView(opened)).toMatchObject({ bank: 75, revealedFinds: [{ salePrice: price }] });
    const sold = perform(storage, opened, { type: 'sellAll' });
    expect(getView(sold)).toMatchObject({ bank, receipt: { revenue: price, profit: price - 25 } });
    expect(act(sold, { type: 'sellAll' })).toBe(sold);
    const returned = perform(storage, sold, { type: 'returnToHub' });
    expect(returned).toMatchObject({ bank, offerSeeds: start.offerSeeds, status: start.status });
  });

  it('отклоняет неверную версию, испорченные seed и лот, сохраняя резерв v2', () => {
    const storage = memoryStorage();
    const start = hub(18);
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 3, state: start }));
    expect(load(storage)).toMatchObject({ kind: 'damaged' });
    expect(save(storage, start)).toEqual({ ok: true });
    const entered = perform(storage, start, { type: 'enterAuction', tier: 'ordinary' });
    if (entered.phase !== 'inspection') throw new Error('Ожидается осмотр');
    for (const state of [
      { ...entered, nextSeed: -1 },
      { ...entered, lot: { ...entered.lot, openingBid: 90 } },
      { ...entered, offerSeeds: { ...entered.offerSeeds, ordinary: 'fixed' } },
    ]) {
      storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state }));
      expect(load(storage)).toMatchObject({ kind: 'recovered', state: start });
    }
  });
});
