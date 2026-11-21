import { expect, it } from 'vitest';
import { visibleEstimate } from './repeat-auctions';
import { getView } from './stage3-engine';
import { accepted, enter, finishAuction, hub, inspectAll, tutorial } from './stage3-test-support';

const ordinaryRoute = [
  { scene: 'tutorial', before: 100, bids: [20, 30], spent: 30, revenue: 45, bank: 115, status: 2 },
  { scene: 'workshop', before: 115, bids: [20, 35, 45, 60], spent: 60, revenue: 61, bank: 116, status: 4 },
  { scene: 'workshop', before: 116, bids: [20, 35], spent: 35, revenue: 54, bank: 135, status: 6 },
  { scene: 'workshop', before: 135, bids: [20, 35], spent: 35, revenue: 50, bank: 150, status: 8 },
  { scene: 'household', before: 150, bids: [25], spent: 25, revenue: 57, bank: 182, status: 10 },
  { scene: 'household', before: 182, bids: [25], spent: 25, revenue: 45, bank: 202, status: 12 },
  { scene: 'household', before: 202, bids: [25], spent: 25, revenue: 34, bank: 211, status: 14 },
  { scene: 'workshop', before: 211, bids: [20, 35], spent: 35, revenue: 88, bank: 264, status: 16 },
  { scene: 'household', before: 264, bids: [25], spent: 25, revenue: 74, bank: 313, status: 18 },
] as const;

it('проходит обычными лотами от $100 до отборных и антикварных торгов', () => {
  let state = tutorial(64);
  for (const [index, expected] of ordinaryRoute.entries()) {
    if (index > 0) {
      const hub = getView(state);
      if (hub.phase !== 'hub') throw new Error('Ожидается экран между торгами');
      expect(hub.auctions[0]).toMatchObject({ tier: 'ordinary', openingBid: expected.bids[0] });
      state = enter(state, 'ordinary');
    }
    expect(getView(state)).toMatchObject({
      phase: 'inspection', lotNumber: index + 1, sceneId: expected.scene, bank: expected.before,
    });
    state = inspectAll(state);
    for (const bid of expected.bids) {
      expect(getView(state)).toMatchObject({ nextBidAmount: bid });
      state = accepted(state, { type: 'bid' });
    }
    const inventory = getView(state);
    if (inventory.phase !== 'reveal') throw new Error('Ожидаются купленные находки');
    expect(inventory.purchasePrice).toBe(expected.spent);
    for (const { id } of inventory.sealedBoxes) state = accepted(state, { type: 'openBox', boxId: id });
    state = accepted(state, { type: 'sellAll' });
    expect(state).toMatchObject({ bank: expected.bank, status: expected.status, receipt: { revenue: expected.revenue } });
    state = accepted(state, { type: 'nextLot' });
    if (expected.status === 8 || expected.status === 18) {
      const tier = expected.status === 8 ? 'selected' : 'antique';
      const price = expected.status === 8 ? 50 : 90;
      const view = getView(state);
      if (view.phase !== 'hub') throw new Error('Ожидается экран между торгами');
      expect(view.auctions.find((entry) => entry.tier === tier)).toMatchObject({
        requiredStatus: expected.status, availability: 'ready', openingBid: price,
      });
      expect(getView(enter(state, tier))).toMatchObject({ phase: 'inspection', tier, bank: expected.bank, nextBidAmount: price });
    }
  }
});

it('пас на сгенерированном обычном лоте с seed 5 сохраняет $17', () => {
  const state = inspectAll(enter(hub(5), 'ordinary'));
  const view = getView(state);
  if (view.phase !== 'inspection') throw new Error('Ожидается осмотр перед торгами');
  const hints = view.visibleItems.flatMap(({ hint }) => hint ? [hint] : []);
  const limit = Math.floor((visibleEstimate(hints) + 20) * 0.85);
  expect(limit).toBe(69);
  expect(finishAuction(state, limit)).toMatchObject({ bank: 100, receipt: { outcome: 'passed' } });
  expect(finishAuction(state, Infinity)).toMatchObject({
    bank: 83, receipt: { outcome: 'sold', purchasePrice: 100, revenue: 83, profit: -17 },
  });
});
