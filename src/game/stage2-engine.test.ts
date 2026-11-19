import { describe, expect, it } from 'vitest';
import { stage2Views } from './stage2-exampleViews';
import { applyCommand, getView, newGame } from './stage2-engine';
import type { Stage2State } from './stage2-engine';
import type { Stage2Command } from './stage2-contract';

type SimpleCommand = Exclude<Stage2Command['type'], 'inspect' | 'openBox' | 'sellItem'>;

function step(state: Stage2State, type: SimpleCommand): Stage2State {
  return applyCommand(state, { type, expectedRevision: state.revision });
}

function inspectBicycle(state: Stage2State): Stage2State {
  return applyCommand(state, { type: 'inspect', itemId: 'bicycle', expectedRevision: state.revision });
}

function openBox(state: Stage2State): Stage2State {
  return applyCommand(state, { type: 'openBox', boxId: 'box', expectedRevision: state.revision });
}

function sellItem(state: Stage2State, itemId: string): Stage2State {
  return applyCommand(state, { type: 'sellItem', itemId, expectedRevision: state.revision });
}

function startAuction(): Stage2State {
  return step(newGame(), 'skipStory');
}

function buyTutorialLot(): Stage2State {
  return step(step(startAuction(), 'bid'), 'bid');
}

function sellContents(state: Stage2State): Stage2State {
  return step(openBox(state), 'sellAll');
}

describe('правила Stage 2', () => {
  it('проводит через четыре кадра и шесть реплик, аренда и пропуск открывают один лот', () => {
    let state = newGame();
    expect(getView(state)).toEqual(stage2Views.door);
    expect(step(state, 'confirmRent')).toBe(state);
    state = step(state, 'storyNext');
    expect(getView(state)).toEqual(stage2Views.rain);
    state = step(state, 'storyNext');
    expect(getView(state)).toEqual(stage2Views.dialogue);

    for (let line = 0; line < 6; line += 1) {
      expect(getView(state)).toMatchObject({ phase: 'prologue', story: { step: 'dialogue', line } });
      expect(getView(step(state, 'skipStory'))).toEqual({ ...stage2Views.inspection, revision: state.revision + 1 });
      state = step(state, 'storyNext');
    }

    expect(getView(state)).toEqual(stage2Views.rent);
    expect(step(state, 'storyNext')).toBe(state);
    const rented = step(state, 'confirmRent');
    expect(getView(rented)).toEqual(stage2Views.inspection);
    expect(step(state, 'skipStory')).toEqual(rented);
    expect(step(rented, 'confirmRent')).toBe(rented);
    expect(step(rented, 'skipStory')).toBe(rented);
  });

  it('проигрывает учебную сделку по примерам от ставки до одноразовой выплаты', () => {
    let state = newGame();
    for (let frame = 0; frame < 8; frame += 1) state = step(state, 'storyNext');
    state = step(state, 'confirmRent');
    state = inspectBicycle(state);
    const bid = { type: 'bid', expectedRevision: state.revision } as const;
    state = applyCommand(state, bid);
    expect(getView(state)).toEqual(stage2Views.bidding);
    expect(applyCommand(state, bid)).toBe(state);

    const bought = step(state, 'bid');
    expect(getView(bought)).toEqual(stage2Views.revealSealed);
    expect(bought.bank).toBe(70);
    const partial = sellItem(bought, 'bicycle');
    expect(partial.bank).toBe(105);
    expect(partial.status).toBe(0);
    expect(sellItem(partial, 'bicycle')).toBe(partial);
    expect(step(partial, 'sellAll')).toBe(partial);

    const opened = openBox(partial);
    expect(opened.bank).toBe(105);
    expect(openBox(opened)).toBe(opened);
    expect(getView(opened)).toEqual(stage2Views.revealPartial);
    const sell = { type: 'sellAll', expectedRevision: opened.revision } as const;
    const sold = applyCommand(opened, sell);
    expect(getView(sold)).toEqual(stage2Views.sold);
    expect(sold.status).toBe(2);
    expect(applyCommand(sold, sell)).toBe(sold);
    expect(step(sold, 'sellAll')).toBe(sold);
    expect(getView(step(sold, 'nextLot'))).toMatchObject({
      phase: 'inspection', sceneId: 'workshop', lotNumber: 2, bank: 115,
    });
  });

  it('сохраняет банк после паса и позволяет осмотреть велосипед уже на торгах', () => {
    const initial = startAuction();
    expect(step(initial, 'sellAll')).toBe(initial);
    expect(step(initial, 'sortGarage')).toBe(initial);
    expect(step(initial, 'nextLot')).toBe(initial);
    expect(openBox(initial)).toBe(initial);
    const bidding = step(initial, 'bid');
    expect(getView(bidding)).toMatchObject({
      phase: 'bidding', bank: 100, allowedActions: ['inspect', 'bid', 'pass'],
    });
    const inspected = inspectBicycle(bidding);
    expect(inspectBicycle(inspected)).toBe(inspected);
    const passed = step(inspected, 'pass');
    expect(getView(passed)).toEqual({ ...stage2Views.passed, revision: 4 });
    expect(passed.status).toBe(0);
    expect(getView(step(passed, 'nextLot'))).toMatchObject({ lotNumber: 2, bank: 100 });
  });

  it('скрывает содержимое коробки и точные цены до разрешённого раскрытия', () => {
    const initial = startAuction();
    const bidding = inspectBicycle(step(initial, 'bid'));
    for (const state of [initial, bidding, step(bidding, 'pass')]) {
      expect(getView(state)).not.toHaveProperty('revealedFinds');
      expect(getView(state)).not.toHaveProperty('lot');
      expect(JSON.stringify(getView(state))).not.toContain('Инструмент из коробки');
    }
    const bought = step(bidding, 'bid');
    expect(getView(bought)).toMatchObject({
      sealedBoxes: [{ id: 'box', name: 'Закрытая коробка' }],
      revealedFinds: [{ id: 'bicycle', salePrice: 35 }],
    });
    expect(JSON.stringify(getView(bought))).not.toContain('Инструмент из коробки');
    expect(sellItem(bought, 'tool')).toBe(bought);
    expect(getView(openBox(bought))).toMatchObject({
      bank: 70, revenue: 0, revealedFinds: [{ id: 'bicycle', salePrice: 35 }, { id: 'tool', salePrice: 10 }],
    });
  });

  it('пропускает выбывшего покупателя и списывает только победную ставку', () => {
    const workshop = step(sellContents(buyTutorialLot()), 'nextLot');
    expect(getView(workshop)).toMatchObject({ sceneId: 'workshop', nextBidAmount: 20, bank: 115 });
    const first = step(workshop, 'bid');
    expect(first).toMatchObject({ activeOpponentIds: ['marina', 'oleg'], lastPlayerBid: 20, opponentBid: 30 });
    expect(getView(first)).toMatchObject({ leaderName: 'Олег', nextBidAmount: 35, bank: 115 });
    const second = step(first, 'bid');
    expect(getView(second)).toMatchObject({ lastPlayerBid: 35, currentPrice: 45, nextBidAmount: 50 });
    const third = step(second, 'bid');
    expect(third).toMatchObject({ activeOpponentIds: ['oleg'], lastPlayerBid: 50, opponentBid: 55 });
    expect(getView(third)).toMatchObject({ leaderName: 'Олег', nextBidAmount: 60, bank: 115 });
    const bought = step(third, 'bid');
    expect(getView(bought)).toMatchObject({ phase: 'reveal', purchasePrice: 60, bank: 55 });
  });

  it('достигает сортировки обычными убытками и выдаёт оплату однократно', () => {
    let state = step(sellContents(buyTutorialLot()), 'nextLot');
    for (let bid = 0; bid < 4; bid += 1) state = step(state, 'bid');
    state = sellContents(state);
    expect(getView(state)).toMatchObject({
      phase: 'result', sceneId: 'workshop', bank: 67, receipt: { revenue: 12, profit: -48 },
    });
    state = step(state, 'nextLot');
    expect(getView(state)).toMatchObject({ phase: 'inspection', sceneId: 'household', lotNumber: 3, bank: 67 });
    for (let bid = 0; bid < 5; bid += 1) state = step(state, 'bid');
    state = sellContents(state);
    expect(getView(state)).toMatchObject({
      phase: 'result', bank: 9, receipt: { purchasePrice: 65, revenue: 7, profit: -58 },
    });
    expect(state.status).toBe(2);
    const recovery = step(state, 'nextLot');
    expect(getView(recovery)).toEqual({
      phase: 'recovery', bank: 9, minimumBid: 20, reward: 11, allowedActions: ['sortGarage'], revision: recovery.revision,
    });
    expect(step(recovery, 'bid')).toBe(recovery);
    const sort = { type: 'sortGarage', expectedRevision: recovery.revision } as const;
    const ready = applyCommand(recovery, sort);
    expect(getView(ready)).toMatchObject({ phase: 'inspection', sceneId: 'workshop', lotNumber: 4, bank: 20 });
    expect(applyCommand(ready, sort)).toBe(ready);
    expect(step(ready, 'sortGarage')).toBe(ready);
    expect(getView(step(ready, 'bid'))).toMatchObject({ phase: 'reveal', purchasePrice: 20, bank: 0 });
  });

  it('отклоняет повышение на $30 при банке $29 и оставляет игроку пас', () => {
    const bidding = { ...step(startAuction(), 'bid'), bank: 29 };
    expect(getView(bidding)).toMatchObject({ nextBidAmount: 30, allowedActions: ['inspect', 'pass'] });
    expect(step(bidding, 'bid')).toBe(bidding);
    expect(step(bidding, 'pass').bank).toBe(29);
  });
});
