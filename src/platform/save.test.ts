import { describe, expect, it } from 'vitest';
import type { Stage2Command } from '../game/stage2-contract';
import { applyCommand, getView, newGame } from '../game/stage2-engine';
import type { Stage2State } from '../game/stage2-engine';
import { applySavedCommand, BACKUP_KEY, load, save, SAVE_KEY } from './save';
import type { SaveStorage } from './save';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  };
}

function playSaved(storage: SaveStorage, state: Stage2State, command: Stage2Command): Stage2State {
  const accepted = applySavedCommand(storage, state, command);
  expect(accepted.kind).toBe('saved');
  const restored = load(storage);
  if (restored.kind !== 'loaded') throw new Error('Не удалось загрузить принятую команду');
  expect(restored.state).toEqual(accepted.state);
  expect(getView(restored.state)).toEqual(getView(accepted.state));
  return restored.state;
}

type SimpleCommand = Exclude<Stage2Command['type'], 'inspect' | 'openBox' | 'sellItem'>;

function step(storage: SaveStorage, state: Stage2State, type: SimpleCommand): Stage2State {
  return playSaved(storage, state, { type, expectedRevision: state.revision });
}

function openBox(storage: SaveStorage, state: Stage2State): Stage2State {
  return playSaved(storage, state, { type: 'openBox', boxId: 'box', expectedRevision: state.revision });
}

describe('сохранение Stage 2', () => {
  it('загружает каждую фазу и сохраняет лот, выбывших покупателей и продажи', () => {
    const storage = memoryStorage();
    expect(load(storage)).toEqual({ kind: 'new' });
    let state = newGame();
    for (let frame = 0; frame < 8; frame += 1) state = step(storage, state, 'storyNext');
    expect(getView(state)).toMatchObject({ phase: 'prologue', story: { step: 'rent' } });
    state = step(storage, state, 'confirmRent');
    state = playSaved(storage, state, { type: 'inspect', itemId: 'bicycle', expectedRevision: state.revision });
    state = step(storage, state, 'bid');
    expect(getView(state)).toMatchObject({ phase: 'bidding', bank: 100, currentPrice: 25 });
    state = step(storage, state, 'bid');
    expect(getView(state)).toMatchObject({ phase: 'reveal', bank: 70, sealedBoxes: [{ id: 'box' }] });
    state = playSaved(storage, state, { type: 'sellItem', itemId: 'bicycle', expectedRevision: state.revision });
    expect(getView(state)).toMatchObject({ bank: 105, revenue: 35, revealedFinds: [] });
    const repeatSale = { type: 'sellItem', itemId: 'bicycle', expectedRevision: state.revision } as const;
    const priorSave = storage.getItem(SAVE_KEY);
    expect(applySavedCommand(storage, state, repeatSale)).toEqual({ kind: 'ignored', state });
    expect(storage.getItem(SAVE_KEY)).toBe(priorSave);

    state = openBox(storage, state);
    expect(getView(state)).toMatchObject({ bank: 105, sealedBoxes: [], revealedFinds: [{ id: 'tool' }] });
    state = step(storage, state, 'sellAll');
    expect(getView(state)).toMatchObject({ phase: 'result', bank: 115, receipt: { revenue: 45 } });
    state = step(storage, state, 'nextLot');
    for (let bid = 0; bid < 3; bid += 1) state = step(storage, state, 'bid');
    expect(state).toMatchObject({ phase: 'bidding', activeOpponentIds: ['oleg'], opponentBid: 55 });
    state = step(storage, state, 'bid');
    state = step(storage, openBox(storage, state), 'sellAll');
    state = step(storage, state, 'nextLot');
    for (let bid = 0; bid < 5; bid += 1) state = step(storage, state, 'bid');
    state = step(storage, openBox(storage, state), 'sellAll');
    state = step(storage, state, 'nextLot');
    expect(getView(state)).toMatchObject({ phase: 'recovery', bank: 9, reward: 11 });
    state = step(storage, state, 'sortGarage');
    expect(getView(state)).toMatchObject({ phase: 'inspection', bank: 20, lotNumber: 4 });
    expect(applySavedCommand(storage, state, { type: 'sortGarage', expectedRevision: state.revision }).kind).toBe('ignored');
  });

  it('восстанавливает предыдущий снимок и сохраняет его до успешной записи', () => {
    const storage = memoryStorage();
    const first = newGame();
    expect(save(storage, first)).toEqual({ ok: true });
    const second = step(storage, first, 'storyNext');
    const validBackup = storage.getItem(BACKUP_KEY);
    storage.setItem(SAVE_KEY, '{"broken":');
    expect(load(storage)).toEqual({
      kind: 'recovered', state: first, message: 'Восстановлено предыдущее сохранение.',
    });
    expect(save(storage, second)).toEqual({ ok: true });
    expect(load(storage)).toEqual({ kind: 'loaded', state: second });
    expect(storage.getItem(BACKUP_KEY)).toBe(validBackup);
  });

  it.each([
    ['повреждённый JSON', '{'],
    ['неизвестную версию', JSON.stringify({ version: 2, state: newGame() })],
    ['несоответствие фазы', JSON.stringify({ version: 1, state: { ...newGame(), phase: 'reveal' } })],
    ['пропущенное поле пролога', JSON.stringify({ version: 1, state: { ...newGame(), storyIndex: undefined } })],
  ])('отклоняет %s и предлагает начать заново', (_name, data) => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, data);
    expect(load(storage)).toMatchObject({ kind: 'damaged', message: expect.stringContaining('начать новую игру') });
  });

  it('отклоняет снимок с изменённым лотом или продажей закрытой находки', () => {
    const storage = memoryStorage();
    const initial = applyCommand(newGame(), { type: 'skipStory', expectedRevision: 0 });
    if (initial.phase !== 'inspection') throw new Error('Учебный лот не открыт');
    const bidding = applyCommand(initial, { type: 'bid', expectedRevision: 1 });
    const bought = applyCommand(bidding, { type: 'bid', expectedRevision: 2 });
    const invalidStates = [
      { ...initial, lot: { ...initial.lot, openingBid: 10 } },
      { ...bidding, leaderId: 'missing' },
      { ...bought, soldItemIds: ['tool'] },
    ];
    for (const state of invalidStates) {
      storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state }));
      expect(load(storage).kind).toBe('damaged');
    }
  });

  it.each([SAVE_KEY, BACKUP_KEY])('оставляет подтверждённый экран при отказе записи %s и даёт повторить', (blockedKey) => {
    const storage = memoryStorage();
    const started = step(storage, newGame(), 'skipStory');
    const state = step(storage, step(storage, started, 'bid'), 'bid');
    const command = { type: 'sellItem', itemId: 'bicycle', expectedRevision: state.revision } as const;
    const locked: SaveStorage = {
      getItem: storage.getItem,
      setItem(key, value) {
        if (key === blockedKey) throw new Error('запись заблокирована');
        storage.setItem(key, value);
      },
    };

    const failed = applySavedCommand(locked, state, command);
    expect(failed).toEqual({ kind: 'failed', state, message: 'Не удалось сохранить игру. Повторите действие.' });
    expect(failed.state).toBe(state);
    expect(getView(failed.state)).toMatchObject({ phase: 'reveal', bank: 70, revenue: 0 });
    expect(load(storage)).toEqual({ kind: 'loaded', state });
    const retried = playSaved(storage, failed.state, command);
    expect(getView(retried)).toMatchObject({ phase: 'reveal', bank: 105, revenue: 35 });
    expect(applySavedCommand(storage, retried, command).kind).toBe('ignored');
  });

  it('отличает отказ чтения от отсутствующего профиля', () => {
    const storage: SaveStorage = {
      getItem() { throw new Error('чтение заблокировано'); },
      setItem() { throw new Error('запись заблокирована'); },
    };
    expect(load(storage)).toMatchObject({ kind: 'unavailable' });
  });
});
