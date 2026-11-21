import { describe, expect, it } from 'vitest';
import { hub } from './stage3-test-support';
import type { RelationshipGoalAction, Stage4Command } from './stage4-contract';
import { applyCommand, getView, migrateStage3, newGame } from './stage4-engine';
import type { Stage4State } from './stage4-engine';

type Action = {
  [Kind in Stage4Command['type']]: Omit<Extract<Stage4Command, { type: Kind }>, 'expectedRevision'>;
}[Stage4Command['type']];

function act(state: Stage4State, action: Action): Stage4State {
  return applyCommand(state, { ...action, expectedRevision: getView(state).revision });
}

function play(state: Stage4State, ...actions: Action[]): Stage4State {
  for (const action of actions) {
    const next = act(state, action);
    if (next === state) throw new Error(`Команда ${action.type} отклонена`);
    state = next;
  }
  return state;
}

function atHub(status: number, bank = 400): Stage4State {
  return migrateStage3({ ...hub(64), status, bank });
}

const meeting = [{ type: 'openRelationship' }, { type: 'meetNeighbor' }] as const;
const flowers = [...meeting, { type: 'buyFlowers' }] as const;
const cinema = [...flowers, { type: 'inviteToCinema' }] as const;
const dinner = [...cinema, { type: 'inviteToDinner' }] as const;

describe('правила истории Stage 4', () => {
  it.each([7, 8, 9])('проверяет вход в историю при статусе %i', (status) => {
    const start = atHub(status);
    const ready = status >= 8;
    const view = getView(start);
    if (view.phase !== 'hub') throw new Error('Ожидается экран между торгами');
    expect(view.allowedActions.includes('openRelationship')).toBe(ready);
    expect(view).toMatchObject({ relationship: { step: 'unmet', nextGoal: { requiredStatus: 8, canProceed: ready } } });
    expect(act(start, { type: 'meetNeighbor' })).toBe(start);
    const open = act(start, { type: 'openRelationship' });
    if (!ready) {
      expect(open).toBe(start);
      return;
    }
    expect(getView(open)).toMatchObject({ phase: 'relationship', step: 'unmet', bank: 400, status });
    expect(getView(play(open, { type: 'meetNeighbor' }))).toMatchObject({ step: 'met', bank: 400, status });
  });

  it.each([11, 12, 13])('проверяет кино при статусе %i', (status) => {
    const start = play(atHub(status), ...flowers);
    const ready = status >= 12;
    expect(getView(start)).toMatchObject({ nextGoal: { action: 'inviteToCinema', requiredStatus: 12, canProceed: ready } });
    const next = act(start, { type: 'inviteToCinema' });
    if (ready) expect(getView(next)).toMatchObject({ step: 'cinemaVisited', bank: 382, status: status + 2 });
    else expect(next).toBe(start);
  });

  it.each([17, 18, 19])('проверяет ужин при статусе %i', (status) => {
    const start = play(atHub(status - 2), ...cinema);
    const ready = status >= 18;
    expect(getView(start)).toMatchObject({ nextGoal: { action: 'inviteToDinner', requiredStatus: 18, canProceed: ready } });
    const next = act(start, { type: 'inviteToDinner' });
    if (ready) expect(getView(next)).toMatchObject({ step: 'dinnerVisited', bank: 357, status: status + 4 });
    else expect(next).toBe(start);
  });

  const payments = [
    { type: 'buyFlowers', before: meeting, price: 8, paid: 0, status: 18, gain: 0 },
    { type: 'inviteToCinema', before: flowers, price: 10, paid: 8, status: 18, gain: 2 },
    { type: 'inviteToDinner', before: cinema, price: 25, paid: 18, status: 20, gain: 4 },
  ] as const;

  it.each(payments)('$type принимает точную сумму один раз и отвергает нехватку $1', ({ type, before, price, paid, status, gain }) => {
    const short = play(atHub(18, paid + price - 1), ...before);
    expect(getView(short)).toMatchObject({ bank: price - 1, nextGoal: { price, canProceed: false }, allowedActions: ['returnToHub'] });
    expect(act(short, { type })).toBe(short);

    const exact = play(atHub(18, paid + price), ...before);
    const confirmed = getView(exact);
    expect(confirmed).toMatchObject({ bank: price, status, nextGoal: { price, canProceed: true } });
    expect(applyCommand(exact, { type, expectedRevision: confirmed.revision - 1 })).toBe(exact);
    const paidOnce = play(exact, { type });
    expect(getView(paidOnce)).toMatchObject({ bank: 0, status: status + gain, revision: confirmed.revision + 1 });
    expect(applyCommand(paidOnce, { type, expectedRevision: confirmed.revision })).toBe(paidOnce);
    expect(act(paidOnce, { type })).toBe(paidOnce);
  });

  it('отклоняет пропуск событий, а самостоятельные посещения сохраняют свои правила', () => {
    const prologue = newGame(64);
    expect(act(prologue, { type: 'openRelationship' })).toBe(prologue);
    const soloCinema = play(atHub(8), { type: 'spend', offerId: 'cinema' });
    expect(getView(soloCinema)).toMatchObject({ bank: 390, status: 10, relationship: { step: 'unmet' } });

    const soloDinner = play(atHub(18), { type: 'spend', offerId: 'restaurant' });
    expect(getView(soloDinner)).toMatchObject({ bank: 375, status: 22, relationship: { step: 'unmet' } });
    const open = play(soloDinner, { type: 'openRelationship' });
    const blocked: readonly RelationshipGoalAction[] = ['buyFlowers', 'inviteToCinema', 'inviteToDinner', 'confirmMoveIn'];
    for (const type of blocked) expect(act(open, { type })).toBe(open);
    expect(act(open, { type: 'spend', offerId: 'restaurant' })).toBe(open);
    expect(act(open, { type: 'enterAuction', tier: 'ordinary' })).toBe(open);

    const afterFlowers = play(open, { type: 'meetNeighbor' }, { type: 'buyFlowers' }, { type: 'returnToHub' });
    expect(act(afterFlowers, { type: 'inviteToCinema' })).toBe(afterFlowers);
    const passed = play(afterFlowers, { type: 'enterAuction', tier: 'ordinary' }, { type: 'pass' }, { type: 'nextLot' });
    expect(getView(play(passed, { type: 'openRelationship' }))).toMatchObject({ step: 'flowersGiven', bank: 367, status: 22 });
  });

  it('предлагает переезд после второго улучшения в порядке дом → машина', () => {
    const returned = play(atHub(18), ...dinner, { type: 'returnToHub' });
    expect(getView(returned)).toMatchObject({ relationship: { nextGoal: { missingUpgrades: ['home', 'car'] } } });
    const home = play(returned, { type: 'spend', offerId: 'home' }, { type: 'openRelationship' });
    expect(getView(home)).toMatchObject({ nextGoal: { missingUpgrades: ['car'], canProceed: false } });
    expect(act(home, { type: 'confirmMoveIn' })).toBe(home);
    const ready = play(home, { type: 'returnToHub' }, { type: 'spend', offerId: 'car' }, { type: 'openRelationship' });
    expect(getView(ready)).toMatchObject({ nextGoal: { missingUpgrades: [], canProceed: true } });
    expect(getView(play(ready, { type: 'confirmMoveIn' }))).toMatchObject({ step: 'movedIn', bank: 107, status: 34 });
  });

  it('учитывает порядок машина → дом до знакомства и продолжает торги после эпилога', () => {
    const improved = play(atHub(0), { type: 'spend', offerId: 'car' }, { type: 'spend', offerId: 'home' });
    const readyForCinema = play(improved, ...flowers, { type: 'returnToHub' }, { type: 'spend', offerId: 'dinerWithTip' });
    const afterCinema = play(readyForCinema, { type: 'openRelationship' }, { type: 'inviteToCinema' }, { type: 'returnToHub' });
    const afterDinner = play(afterCinema,
      { type: 'spend', offerId: 'dinerWithTip' }, { type: 'spend', offerId: 'dinerWithTip' },
      { type: 'openRelationship' }, { type: 'inviteToDinner' });
    const epilogue = play(afterDinner, { type: 'confirmMoveIn' });
    expect(getView(epilogue)).toMatchObject({ phase: 'relationship', step: 'movedIn', bank: 86, status: 22, nextGoal: null });
    expect(act(epilogue, { type: 'confirmMoveIn' })).toBe(epilogue);
    const returned = play(epilogue, { type: 'returnToHub' });
    expect(getView(returned)).toMatchObject({ relationship: { step: 'movedIn', nextGoal: null } });
    expect(getView(play(returned, { type: 'enterAuction', tier: 'ordinary' }))).toMatchObject({ phase: 'inspection', bank: 86 });
    expect(getView(play(returned, { type: 'openRelationship' }))).toMatchObject({ phase: 'relationship', step: 'movedIn' });
  });
});

it('проходит от пролога до эпилога за девять прибыльных обычных лотов на seed 64', () => {
  const limits = [30, 60, 35, 35, 25, 25, 25, 35, 25];
  let state = play(newGame(64), { type: 'skipStory' });
  for (const [index, limit] of limits.entries()) {
    if (index > 0) state = play(state, { type: 'enterAuction', tier: 'ordinary' });
    for (let view = getView(state); view.phase === 'inspection' || view.phase === 'bidding'; view = getView(state)) {
      expect(view.nextBidAmount).toBeLessThanOrEqual(limit);
      state = play(state, { type: 'bid' });
    }
    const inventory = getView(state);
    if (inventory.phase !== 'reveal') throw new Error('Ожидается покупка лота');
    for (const { id } of inventory.sealedBoxes) state = play(state, { type: 'openBox', boxId: id });
    state = play(state, { type: 'sellAll' });
    const sold = getView(state);
    if (sold.phase !== 'result') throw new Error('Ожидается квитанция');
    expect(sold.receipt.profit).toBeGreaterThan(0);
    state = play(state, { type: 'nextLot' });

    if (index === 3) {
      state = play(state, ...flowers, { type: 'returnToHub' });
      expect(getView(state)).toMatchObject({ bank: 142, status: 8, relationship: { step: 'flowersGiven' } });
    }
    if (index === 5) {
      state = play(state, { type: 'openRelationship' }, { type: 'inviteToCinema' }, { type: 'returnToHub' });
      expect(getView(state)).toMatchObject({ bank: 184, status: 14, relationship: { step: 'cinemaVisited' } });
    }
    if (index === 7) {
      state = play(state, { type: 'openRelationship' }, { type: 'inviteToDinner' }, { type: 'returnToHub' });
      expect(getView(state)).toMatchObject({ bank: 221, status: 22, relationship: { step: 'dinnerVisited' } });
    }
  }

  const epilogue = play(state, { type: 'spend', offerId: 'home' }, { type: 'spend', offerId: 'car' },
    { type: 'openRelationship' }, { type: 'confirmMoveIn' });
  expect(getView(epilogue)).toMatchObject({ phase: 'relationship', step: 'movedIn', bank: 20, status: 34 });
  let nextLot = play(epilogue, { type: 'returnToHub' }, { type: 'enterAuction', tier: 'ordinary' });
  if (getView(nextLot).phase === 'recovery') nextLot = play(nextLot, { type: 'sortGarage' });
  expect(getView(nextLot)).toMatchObject({ phase: 'inspection', tier: 'ordinary', lotNumber: 10 });
});
