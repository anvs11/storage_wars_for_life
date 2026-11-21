import { describe, expect, it } from 'vitest';
import { chooseBaggage } from './baggage';
import type { GarageLot, LotFind } from './catalog';
import { draw } from './random';
import { advanceAuctionPrice, generateLot, openingBidFor, opponentLimits } from './repeat-auctions';
import { enterLot } from './stage2-engine';
import type { AuctionTier, OfferId } from './stage3-contract';
import { applyCommand, getView, newGame } from './stage3-engine';
import type { Stage3State } from './stage3-engine';
import { accepted, act, enter, finishAuction, hub, inspectAll, tutorial } from './stage3-test-support';

function hubView(state: Stage3State) {
  const view = getView(state);
  if (view.phase !== 'hub') throw new Error('Ожидается экран выбора торгов');
  return view;
}

describe('прогрессия Stage 3', () => {
  it('оставляет учебный гараж первым и даёт +2 только при последней продаже с прибылью', () => {
    let story = newGame(42);
    for (let index = 0; index < 8; index += 1) story = accepted(story, { type: 'storyNext' });
    const rented = accepted(story, { type: 'confirmRent' });
    expect(getView(rented)).toEqual({ ...getView(tutorial(42)), revision: 9 });
    const bought = accepted(accepted(rented, { type: 'bid' }), { type: 'bid' });
    expect(getView(bought)).toMatchObject({ phase: 'reveal', tier: 'ordinary', purchasePrice: 30, bank: 70 });
    const partial = accepted(bought, { type: 'sellItem', itemId: 'bicycle' });
    expect(partial).toMatchObject({ bank: 105, status: 0 });
    const opened = accepted(partial, { type: 'openBox', boxId: 'box' });
    const sell = { type: 'sellItem', itemId: 'tool', expectedRevision: opened.revision } as const;
    const sold = applyCommand(opened, sell);
    expect(sold).toMatchObject({ phase: 'result', bank: 115, status: 2, receipt: { revenue: 45, profit: 15 } });
    expect(applyCommand(sold, sell)).toBe(sold);
    expect(act(sold, { type: 'sellAll' })).toBe(sold);
    expect(getView(accepted(sold, { type: 'nextLot' }))).toMatchObject({ phase: 'hub', bank: 115, status: 2 });
  });

  it.each([
    ['selected', 7, 8, 50], ['antique', 17, 18, 90],
  ] as const)('открывает %s при переходе с %i до %i и проверяет банк у порога ставки', (tier, before, after, price) => {
    const start = { ...hub(10), bank: price, status: before };
    const action = { type: 'enterAuction', tier } as const;
    expect(hubView(start).auctions.find((entry) => entry.tier === tier)?.availability).toBe('statusLocked');
    expect(act(start, action)).toBe(start);
    const poor = { ...start, bank: price - 1, status: after };
    expect(hubView(poor).auctions.find((entry) => entry.tier === tier)?.availability).toBe('fundsLocked');
    expect(act(poor, action)).toBe(poor);
    const ordinary = enter(poor, 'ordinary');
    expect(getView(ordinary)).toMatchObject({ phase: 'inspection', tier: 'ordinary' });
    const exact = enter({ ...start, status: after }, tier);
    expect(getView(exact)).toMatchObject({ phase: 'inspection', tier, nextBidAmount: price, bank: price });
    const passed = accepted(exact, { type: 'pass' });
    expect(passed.bank).toBe(price);
    expect(getView(enter(accepted(passed, { type: 'nextLot' }), 'ordinary'))).toMatchObject({ phase: 'inspection', tier: 'ordinary' });
  });

  it('берёт деньги и начисляет очки за одно действие, улучшения покупаются по одному разу', () => {
    const start = { ...hub(11), bank: 275 };
    const visit = { type: 'spend', offerId: 'dinerWithTip', expectedRevision: start.revision } as const;
    const afterTip = applyCommand(start, visit);
    expect(afterTip).toMatchObject({ bank: 268, status: 2 });
    expect(applyCommand(afterTip, visit)).toBe(afterTip);
    expect(act(afterTip, { type: 'spend', offerId: 'cinema' })).toBe(afterTip);
    const afterDiner = accepted(afterTip, { type: 'spend', offerId: 'diner' });
    expect(afterDiner).toMatchObject({ bank: 263, status: 3 });
    let state = afterDiner;
    for (const offerId of ['home', 'car'] as const) {
      state = accepted(state, { type: 'spend', offerId });
      expect(act(state, { type: 'spend', offerId })).toBe(state);
      expect(hubView(state).offers.find(({ id }) => id === offerId)?.availability).toBe('owned');
    }
    expect(state).toMatchObject({ bank: 13, status: 13, assets: ['home', 'car'] });
    expect(accepted(state, { type: 'spend', offerId: 'cinema' })).toMatchObject({ bank: 3, status: 15 });
  });

  it.each([['home', 150], ['car', 100]] as const)('разрешает %s при точном банке и отклоняет при нехватке доллара', (offerId, price) => {
    const start = { ...hub(27), bank: price - 1 };
    const spend = { type: 'spend', offerId } as const;
    expect(act(start, spend)).toBe(start);
    expect(accepted({ ...start, bank: price }, spend)).toMatchObject({ bank: 0, status: 5, assets: [offerId] });
  });

  it.each([
    ['cinema', 8, 10, 2], ['restaurant', 18, 25, 4], ['theater', 18, 20, 3],
  ] as const)('проверяет порог и цену занятия %s', (offerId: OfferId, status, price, statusGain) => {
    const start = { ...hub(27), bank: price, status: status - 1 };
    const spend = { type: 'spend', offerId } as const;
    expect(act(start, spend)).toBe(start);
    expect(accepted({ ...start, status }, spend)).toMatchObject({ bank: 0, status: status + statusGain });
  });

  it.each([20, 25])('сохраняет старт $%i при банке $22 и при возврате из аэропорта', (openingBid) => {
    let offeredSeed = 0;
    while (openingBidFor('ordinary', offeredSeed) !== openingBid) offeredSeed += 1;
    const start = hub(0);
    const low = { ...start, bank: 22, offerSeeds: { ...start.offerSeeds, ordinary: offeredSeed } };
    const storedView = hubView(low).auctions[0];
    const back = accepted(accepted(low, { type: 'callAirport' }), { type: 'returnToHub' });
    expect(hubView(back).auctions[0]).toEqual(storedView);
    let entry = enter(back, 'ordinary');
    if (openingBid === 25) {
      expect(storedView).toMatchObject({ openingBid, availability: 'recovery' });
      expect(getView(entry)).toMatchObject({ phase: 'recovery', bank: 22, reward: 3 });
      entry = accepted(entry, { type: 'sortGarage' });
      expect(act(entry, { type: 'sortGarage' })).toBe(entry);
    } else {
      expect(storedView).toMatchObject({ openingBid, availability: 'ready' });
    }
    expect(getView(entry)).toMatchObject({ phase: 'inspection', nextBidAmount: openingBid });
  });
});

const visibleFinds: readonly LotFind[] = [
  {
    id: 'radio', name: 'Радиоприёмник', condition: 'worn', salePrice: 25,
    hint: { text: 'Антенна выдвигается.', estimatedSalePrice: { min: 19, max: 31 } },
  },
  {
    id: 'lamp', name: 'Настольная лампа', condition: 'worn', salePrice: 20,
    hint: { text: 'Стойка держится.', estimatedSalePrice: { min: 14, max: 26 } },
  },
];

function pairedLot(hiddenPrice: number): Stage3State {
  const lot: GarageLot<'household'> = {
    sceneId: 'household', openingBid: 25, bidIncrement: 5, visibleFinds,
    boxes: [{
      id: 'pair-box', name: 'Закрытая коробка',
      contents: [{
        id: 'hidden', name: 'Набор из коробки', condition: 'worn', salePrice: hiddenPrice,
        hint: { text: 'В коробке лежит набор.', estimatedSalePrice: null },
      }],
    }],
    opponents: opponentLimits('ordinary', visibleFinds.map(({ hint }) => hint), 1, ['Виктория'], () => 0.6),
  };
  const { nextSeed, offerSeeds, assets, bank, status, revision } = hub(42);
  const state = enterLot({ bank, status, revision: revision + 1 }, 2, lot);
  return { ...state, nextSeed, offerSeeds, assets, tier: 'ordinary', lotSeed: 42 };
}

describe('аукционная экономика', () => {
  it('при одинаковых уликах и случайности держит одну историю ставок для коробок за $4 и $35', () => {
    let cheap = inspectAll(pairedLot(4));
    let expensive = inspectAll(pairedLot(35));
    for (const [bid, leadingPrice] of [[25, 30], [35, 40], [45, 50]] as const) {
      expect(getView(cheap)).toEqual(getView(expensive));
      expect(getView(cheap)).toMatchObject({ nextBidAmount: bid });
      cheap = accepted(cheap, { type: 'bid' });
      expensive = accepted(expensive, { type: 'bid' });
      expect(getView(expensive)).toMatchObject({ phase: 'bidding', lastPlayerBid: bid, currentPrice: leadingPrice });
    }
    expect(getView(cheap)).toEqual(getView(expensive));
    expect(getView(cheap)).toMatchObject({ currentPrice: 50, nextBidAmount: 60 });
    const pass = finishAuction(cheap, 51);
    expect(getView(pass)).toMatchObject({ phase: 'result', bank: 100, receipt: { outcome: 'passed' } });
    expect(finishAuction(cheap, Infinity)).toMatchObject({ bank: 89, status: 0, receipt: { purchasePrice: 60, profit: -11 } });
    expect(finishAuction(expensive, Infinity)).toMatchObject({ bank: 120, status: 2, receipt: { purchasePrice: 60, profit: 20 } });
    expect(finishAuction(pairedLot(15), Infinity)).toMatchObject({ bank: 100, status: 0, receipt: { profit: 0 } });
  });

  it('меняет шаг от текущей цены для обеих сторон и оставляет учебный путь прежним', () => {
    expect([45, 50, 90, 100, 115].map(advanceAuctionPrice)).toEqual([50, 60, 100, 115, 130]);
    const seed = Array.from({ length: 80 }, (_, index) => index).find((candidate) => {
      const [first, second] = generateLot('antique', candidate, 2).opponents;
      return first!.limit >= 100 && first!.limit < 145 && second!.limit >= 115 && second!.limit < 145;
    });
    if (seed === undefined) throw new Error('Для перехода через $100 нужны два покупателя');
    const lot = generateLot('antique', seed, 2);
    const start = enter({ ...hub(1), status: 18, bank: 1000, offerSeeds: { ordinary: 2, selected: 3, antique: seed } }, 'antique');
    expect(getView(start)).toMatchObject({ nextBidAmount: 90 });
    const next = accepted(start, { type: 'bid' });
    expect(next).toHaveProperty('lot', lot);
    expect(next).toMatchObject({ phase: 'bidding', opponentBid: 115, activeOpponentIds: ['bidder-1', 'bidder-2'] });
    expect(getView(next)).toMatchObject({ nextBidAmount: 130 });
    const poor = { ...next, bank: 129 };
    expect(getView(poor)).toMatchObject({ nextBidAmount: 130, allowedActions: ['inspect', 'pass'] });
    expect(act(poor, { type: 'bid' })).toBe(poor);
    expect(accepted(poor, { type: 'pass' }).bank).toBe(129);
    expect(accepted({ ...next, bank: 130 }, { type: 'bid' })).toMatchObject({
      phase: 'reveal', purchasePrice: 130, bank: 0,
    });
  });

  it.each(['ordinary', 'selected', 'antique'] as const)('проверяет форму, бюджет и известные диапазоны каталога для %s', (tier: AuctionTier) => {
    const counts = tier === 'ordinary' ? [1] : tier === 'selected' ? [1, 2] : [2];
    const [minimum, maximum] = tier === 'ordinary' ? [12, 100] : tier === 'selected' ? [30, 180] : [55, 320];
    for (let seed = 0; seed < 60; seed += 1) {
      const lot = generateLot(tier, seed, seed + 2);
      expect(lot).toEqual(generateLot(tier, seed, seed + 2));
      expect([2, 3]).toContain(lot.visibleFinds.length);
      expect(counts).toContain(lot.boxes.length);
      const items = [...lot.visibleFinds, ...lot.boxes.flatMap(({ contents }) => contents)];
      const ids = [...items, ...lot.boxes].map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
      const total = items.reduce((sum, { salePrice }) => sum + salePrice, 0);
      expect(total).toBeGreaterThanOrEqual(minimum);
      expect(total).toBeLessThanOrEqual(maximum);
      for (const { salePrice, hint } of items) {
        expect(hint.text.length).toBeGreaterThan(0);
        if (!hint.estimatedSalePrice) throw new Error('У предмета нет оценки');
        expect(salePrice).toBeGreaterThanOrEqual(hint.estimatedSalePrice.min);
        expect(salePrice).toBeLessThanOrEqual(hint.estimatedSalePrice.max);
      }
    }
  });
});

describe('багаж Stage 3', () => {
  it.each([[0, 4], [0.449999, 4], [0.45, 25], [0.799999, 25], [0.8, 60], [0.999999, 60]])('выбирает по весам при %f', (roll, price) => {
    expect(chooseBaggage(() => roll).boxes[0]?.contents[0]?.salePrice).toBe(price);
  });

  it('отменяет звонок без списания и защищает подтверждение, вскрытие и продажу', () => {
    const start = hub(23);
    expect(act(start, { type: 'buyBaggage' })).toBe(start);
    const broke = accepted({ ...start, bank: 24 }, { type: 'callAirport' });
    expect(getView(broke)).toMatchObject({ price: 25, canAfford: false, allowedActions: ['returnToHub'] });
    expect(act(broke, { type: 'buyBaggage' })).toBe(broke);
    const airport = accepted(start, { type: 'callAirport' });
    expect(accepted(airport, { type: 'returnToHub' })).toMatchObject({ phase: 'hub', bank: 100, nextSeed: start.nextSeed });
    const buy = { type: 'buyBaggage', expectedRevision: airport.revision } as const;
    const bought = applyCommand(airport, buy);
    expect(getView(bought)).toEqual({
      phase: 'baggageInventory', bank: 75, revision: bought.revision, purchasePrice: 25, revenue: 0,
      sealedBoxes: [{ id: 'suitcase', name: 'Закрытый чемодан' }], revealedFinds: [], allowedActions: ['openBox'],
    });
    expect(applyCommand(bought, buy)).toBe(bought);
    expect(act(bought, { type: 'returnToHub' })).toBe(bought);
    expect(act(bought, { type: 'sellItem', itemId: 'suitcase-find' })).toBe(bought);
    const opened = accepted(bought, { type: 'openBox', boxId: 'suitcase' });
    expect(opened.bank).toBe(75);
    expect(act(opened, { type: 'openBox', boxId: 'suitcase' })).toBe(opened);
    const expected = chooseBaggage(() => draw(airport.nextSeed).value).boxes[0]!.contents[0]!.salePrice;
    const result = accepted(opened, { type: 'sellAll' });
    expect(result).toMatchObject({ bank: 75 + expected, status: 0, receipt: { purchasePrice: 25, revenue: expected, profit: expected - 25 } });
    expect(act(result, { type: 'sellAll' })).toBe(result);
    expect(accepted(result, { type: 'returnToHub' })).toMatchObject({ phase: 'hub', bank: 75 + expected });
  });
});
