import { describe, expect, it } from 'vitest';
import { applyCommand, getView, newGame } from './engine';
import {
  inspectedView,
  inspectionView,
  opponentBidView,
  passedResultView,
  revealView,
  soldResultView,
} from './exampleViews';

function playToOpponentBid() {
  const initial = newGame();
  const inspected = applyCommand(initial, { type: 'inspect', itemId: 'bicycle', expectedRevision: 0 });
  return applyCommand(inspected, { type: 'bid', expectedRevision: 1 });
}

describe('учебный аукцион', () => {
  it('открывает подсказку, принимает победную ставку и переносит банк после продажи', () => {
    const initial = newGame();
    expect(getView(initial)).toEqual(inspectionView);
    const inspected = applyCommand(initial, { type: 'inspect', itemId: 'bicycle', expectedRevision: 0 });
    expect(getView(inspected)).toEqual(inspectedView);

    const bidding = applyCommand(inspected, { type: 'bid', expectedRevision: 1 });
    expect(getView(bidding)).toEqual(opponentBidView);
    const reveal = applyCommand(bidding, { type: 'bid', expectedRevision: 2 });
    expect(getView(reveal)).toEqual(revealView);
    const result = applyCommand(reveal, { type: 'sellAll', expectedRevision: 3 });
    expect(getView(result)).toEqual(soldResultView);

    const next = applyCommand(result, { type: 'nextLot', expectedRevision: 4 });
    expect(next.lotNumber).toBe(2);
    expect(getView(next)).toEqual({ ...inspectionView, bank: 115, revision: 5 });
    expect(applyCommand(next, { type: 'bid', expectedRevision: 2 })).toBe(next);
  });

  it('после паса сохраняет $100 и открывает следующий лот', () => {
    const passed = applyCommand(playToOpponentBid(), { type: 'pass', expectedRevision: 2 });
    expect(getView(passed)).toEqual(passedResultView);
    const next = applyCommand(passed, { type: 'nextLot', expectedRevision: 3 });
    expect(next.lotNumber).toBe(2);
    expect(getView(next)).toEqual({ ...inspectionView, revision: 4 });
  });

  it('не начисляет выручку при повторной продаже со старой или текущей ревизией', () => {
    const reveal = applyCommand(playToOpponentBid(), { type: 'bid', expectedRevision: 2 });
    const sell = { type: 'sellAll', expectedRevision: 3 } as const;
    const result = applyCommand(reveal, sell);
    expect(result.bank).toBe(115);
    expect(applyCommand(result, sell)).toBe(result);
    expect(applyCommand(result, { ...sell, expectedRevision: result.revision })).toBe(result);
  });

  it('игнорирует повторный клик по первой ставке с той же ревизией', () => {
    const bid = { type: 'bid', expectedRevision: 0 } as const;
    const bidding = applyCommand(newGame(), bid);
    expect(getView(bidding)).toMatchObject({ phase: 'bidding', revision: 1, currentPrice: 25, bank: 100 });
    expect(applyCommand(bidding, bid)).toBe(bidding);
  });

  it('показывает цену ставки и блокирует действие при нехватке $1', () => {
    const bidding = { ...playToOpponentBid(), bank: 29 };
    const view = getView(bidding);
    expect(view.nextBidAmount).toBe(30);
    expect(view.allowedActions).toEqual(['pass']);
    expect(applyCommand(bidding, { type: 'bid', expectedRevision: bidding.revision })).toBe(bidding);

    const exact = { ...bidding, bank: 30 };
    const bought = applyCommand(exact, { type: 'bid', expectedRevision: exact.revision });
    expect(getView(bought)).toMatchObject({ phase: 'reveal', bank: 0, purchasePrice: 30 });
  });

  it('не раскрывает точные цены и содержимое коробки до покупки и после паса', () => {
    const initial = newGame();
    const bidding = applyCommand(initial, { type: 'bid', expectedRevision: 0 });
    const inspected = applyCommand(bidding, { type: 'inspect', itemId: 'bicycle', expectedRevision: 1 });
    const passed = applyCommand(inspected, { type: 'pass', expectedRevision: 2 });
    expect(getView(inspected)).toEqual(opponentBidView);

    for (const state of [initial, bidding, inspected, passed]) {
      const view = getView(state);
      expect(view).not.toHaveProperty('revealedFinds');
      expect(view).not.toHaveProperty('lot');
      expect(view.visibleItems.map(({ id }) => id)).toEqual(['bicycle', 'box']);
      for (const item of view.visibleItems) expect(item).not.toHaveProperty('salePrice');
    }
  });

  it('отклоняет действия для неверной фазы, закрытой коробки и повторного осмотра', () => {
    const initial = newGame();
    expect(applyCommand(initial, { type: 'sellAll', expectedRevision: 0 })).toBe(initial);
    expect(applyCommand(initial, { type: 'nextLot', expectedRevision: 0 })).toBe(initial);
    expect(applyCommand(initial, { type: 'inspect', itemId: 'box', expectedRevision: 0 })).toBe(initial);
    expect(applyCommand(initial, { type: 'inspect', itemId: 'missing', expectedRevision: 0 })).toBe(initial);

    const inspected = applyCommand(initial, { type: 'inspect', itemId: 'bicycle', expectedRevision: 0 });
    expect(applyCommand(inspected, { type: 'inspect', itemId: 'bicycle', expectedRevision: 1 })).toBe(inspected);

    const revealed = applyCommand(playToOpponentBid(), { type: 'bid', expectedRevision: 2 });
    expect(applyCommand(revealed, { type: 'bid', expectedRevision: 3 })).toBe(revealed);
    expect(applyCommand(revealed, { type: 'pass', expectedRevision: 3 })).toBe(revealed);
  });
});
