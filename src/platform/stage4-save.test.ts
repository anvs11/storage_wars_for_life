import { describe, expect, it } from 'vitest';
import { applyCommand as applyStage2, newGame as newStage2 } from '../game/stage2-engine';
import { getView as getStage3View } from '../game/stage3-engine';
import { accepted, hub } from '../game/stage3-test-support';
import type { Stage4Command } from '../game/stage4-contract';
import { getView, migrateStage3 } from '../game/stage4-engine';
import type { Stage4State } from '../game/stage4-engine';
import { BACKUP_KEY, SAVE_KEY, save as saveStage2 } from './save';
import type { SaveStorage } from './save';
import { save as saveStage3 } from './stage3-save';
import { applySavedCommand, load, save } from './stage4-save';

type Action = {
  [Kind in Stage4Command['type']]: Omit<Extract<Stage4Command, { type: Kind }>, 'expectedRevision'>;
}[Stage4Command['type']];

function memoryStorage(): SaveStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  };
}

function storedState(storage: SaveStorage): Stage4State {
  const result = load(storage);
  if (result.kind !== 'loaded') throw new Error(`Не удалось загрузить сохранение: ${result.kind}`);
  return result.state;
}

function play(storage: SaveStorage, state: Stage4State, ...actions: Action[]): Stage4State {
  for (const action of actions) {
    const result = applySavedCommand(storage, state, { ...action, expectedRevision: getView(state).revision });
    if (result.kind !== 'saved') throw new Error(`Команда ${action.type} не сохранена: ${result.kind}`);
    state = storedState(storage);
    expect(state).toEqual(result.state);
  }
  return state;
}

function withUpgrades(): Stage4State {
  const start = { ...hub(64), bank: 400, status: 18 };
  const upgraded = accepted(accepted(start, { type: 'spend', offerId: 'home' }), { type: 'spend', offerId: 'car' });
  return migrateStage3(upgraded);
}

describe('сохранения Stage 4', () => {
  it('сохраняет открытый экран и оплаченные шаги, восстанавливает эпилог из резерва', () => {
    const storage = memoryStorage();
    const flowers = play(storage, withUpgrades(),
      { type: 'openRelationship' }, { type: 'meetNeighbor' }, { type: 'buyFlowers' });
    expect(getView(flowers)).toMatchObject({ phase: 'relationship', step: 'flowersGiven', bank: 142, status: 28 });
    const closed = play(storage, flowers, { type: 'returnToHub' });
    expect(getView(closed)).toMatchObject({ phase: 'hub', relationship: { step: 'flowersGiven' } });
    const cinema = play(storage, closed, { type: 'openRelationship' }, { type: 'inviteToCinema' });
    expect(getView(cinema)).toMatchObject({ phase: 'relationship', step: 'cinemaVisited', bank: 132, status: 30 });
    const dinner = play(storage, cinema, { type: 'inviteToDinner' });
    const epilogue = play(storage, dinner, { type: 'confirmMoveIn' });
    expect(getView(epilogue)).toMatchObject({ phase: 'relationship', step: 'movedIn', bank: 107, status: 34 });
    expect(storage.getItem(SAVE_KEY)).toContain('"version":3');
    const returned = play(storage, epilogue, { type: 'returnToHub' });
    expect(getView(returned)).toMatchObject({ phase: 'hub', relationship: { step: 'movedIn' } });

    storage.setItem(SAVE_KEY, '{');
    const backup = load(storage);
    expect(backup).toMatchObject({ kind: 'recovered', state: epilogue, message: expect.stringMatching(/предыдущее/) });
    if (backup.kind !== 'recovered') throw new Error('Ожидается восстановление эпилога');
    const revision = getView(backup.state).revision;
    for (const type of ['inviteToDinner', 'confirmMoveIn'] as const) {
      expect(applySavedCommand(storage, backup.state, { type, expectedRevision: revision })).toEqual({ kind: 'ignored', state: backup.state });
    }
    const next = play(storage, backup.state, { type: 'returnToHub' }, { type: 'enterAuction', tier: 'ordinary' });
    expect(getView(next)).toMatchObject({ phase: 'inspection', bank: 107 });
  });

  it('оставляет подтверждённую сцену при отказе записи и сохраняет повтор оплаты один раз', () => {
    const storage = memoryStorage();
    const start = play(storage, withUpgrades(), { type: 'openRelationship' }, { type: 'meetNeighbor' }, { type: 'buyFlowers' });
    const before = getView(start);
    const command = { type: 'inviteToCinema', expectedRevision: before.revision } as const;
    const locked: SaveStorage = {
      getItem: storage.getItem,
      setItem(key, value) {
        if (key === SAVE_KEY) throw new Error('Запись заблокирована');
        storage.setItem(key, value);
      },
    };
    const failure = applySavedCommand(locked, start, command);
    expect(failure.kind).toBe('failed');
    expect(failure.state).toBe(start);
    expect(getView(storedState(storage))).toEqual(before);

    const result = applySavedCommand(storage, failure.state, command);
    expect(result.kind).toBe('saved');
    expect(storedState(storage)).toEqual(result.state);
    expect(getView(result.state)).toMatchObject({ step: 'cinemaVisited', bank: 132, status: 30, revision: before.revision + 1 });
    expect(applySavedCommand(storage, result.state, command).kind).toBe('ignored');
    const latest = { ...command, expectedRevision: getView(result.state).revision };
    expect(applySavedCommand(storage, result.state, latest).kind).toBe('ignored');
  });

  it('переносит профиль v2 с улучшениями и активной ставкой, включая резервную копию', () => {
    const storage = memoryStorage();
    const upgraded = withUpgrades().game;
    const lot = accepted(upgraded, { type: 'enterAuction', tier: 'ordinary' });
    const lotView = getStage3View(lot);
    if (lotView.phase !== 'inspection') throw new Error('Ожидается осмотр');
    const item = lotView.visibleItems.find(({ canInspect }) => canInspect);
    if (!item) throw new Error('Ожидается улика');
    const inspected = accepted(lot, { type: 'inspect', itemId: item.id });
    const bidding = accepted(inspected, { type: 'bid' });
    expect(bidding).toMatchObject({ phase: 'bidding', bank: 150, status: 28, assets: ['home', 'car'] });
    expect(saveStage3(storage, bidding)).toEqual({ ok: true });
    const v2 = storage.getItem(SAVE_KEY)!;
    const migrated = storedState(storage);
    expect(migrated).toEqual({ game: bidding, relationshipStep: 'unmet', relationshipOpen: false });
    expect(getView(migrated)).toEqual(getStage3View(bidding));

    const next = play(storage, migrated, { type: 'pass' });
    expect(getView(next)).toMatchObject({ phase: 'result', bank: 150, receipt: { outcome: 'passed' } });
    expect(storage.getItem(BACKUP_KEY)).toBe(v2);
    storage.setItem(SAVE_KEY, '{');
    const recovered = load(storage);
    expect(recovered).toMatchObject({ kind: 'recovered', state: migrated });
    expect(play(storage, migrated, { type: 'pass' })).toEqual(next);
    expect(getView(play(storage, next, { type: 'nextLot' }, { type: 'openRelationship' }))).toMatchObject({
      phase: 'relationship', step: 'unmet', bank: 150, status: 28,
    });
  });

  it('загружает снимок v1 и продолжает учебные торги по прежним правилам', () => {
    const storage = memoryStorage();
    const inspection = applyStage2(newStage2(), { type: 'skipStory', expectedRevision: 0 });
    const bidding = applyStage2(inspection, { type: 'bid', expectedRevision: 1 });
    expect(saveStage2(storage, bidding)).toEqual({ ok: true });
    const migrated = storedState(storage);
    expect(getView(migrated)).toMatchObject({ phase: 'bidding', bank: 100, currentPrice: 25, nextBidAmount: 30 });
    const sold = play(storage, migrated, { type: 'bid' }, { type: 'openBox', boxId: 'box' }, { type: 'sellAll' });
    expect(getView(sold)).toMatchObject({ phase: 'result', bank: 115, receipt: { profit: 15 } });
  });

  it('отклоняет неизвестный шаг, невозможный открытый экран и эпилог без улучшений', () => {
    const storage = memoryStorage();
    const start = migrateStage3({ ...hub(64), status: 8 });
    expect(save(storage, start)).toEqual({ ok: true });
    play(storage, start, { type: 'openRelationship' });
    const activeLot = accepted(start.game, { type: 'enterAuction', tier: 'ordinary' });
    for (const invalid of [
      { ...start, relationshipStep: 'unknown' },
      { ...start, relationshipOpen: 'true' },
      { ...start, relationshipOpen: true, game: activeLot },
      { ...start, relationshipOpen: true, game: { ...start.game, status: 7 } },
      { ...start, relationshipOpen: true, relationshipStep: 'cinemaVisited' },
      { ...start, relationshipOpen: true, relationshipStep: 'movedIn', game: { ...start.game, status: 22 } },
    ]) {
      storage.setItem(SAVE_KEY, JSON.stringify({ version: 3, state: invalid }));
      expect(load(storage)).toMatchObject({ kind: 'recovered', state: start });
    }
  });
});
