import type { GarageLot } from './catalog';
import { draw } from './random';

export interface OpenRound {
  readonly bids: readonly string[];
  readonly elapsed: number;
  readonly skipped: boolean;
}
export const initialRound: OpenRound = { bids: [], elapsed: 0, skipped: false };

export function offerAt(lot: GarageLot<string>, seed: number, round: OpenRound, advance: (p: number) => number) {
  let ask = lot.openingBid;
  let standing = 0;
  const amounts = new Map<string, number>();
  for (const id of round.bids) {
    standing = ask;
    amounts.set(id, ask);
    ask = advance(ask);
  }
  const leader = round.bids.at(-1);
  const candidates = lot.opponents.map((opponent, index) => ({
    ...opponent, delay: 3 + draw(seed ^ Math.imul(round.bids.length + 1, 31337) ^ index).word % 5,
  })).filter(opponent => opponent.id !== leader && opponent.limit >= ask);
  candidates.sort((a, b) => a.delay - b.delay || a.id.localeCompare(b.id));
  return { ask, standing, leader, amounts, next: candidates[0] };
}

export function validRound(value: unknown, lot: GarageLot<string>, seed: number, bank: number, advance: (p: number) => number): value is OpenRound {
  if (!value || typeof value !== 'object' || !('bids' in value) || !Array.isArray(value.bids)
    || !('elapsed' in value) || !Number.isInteger(value.elapsed) || Number(value.elapsed) < 0 || Number(value.elapsed) >= 10
    || !('skipped' in value) || typeof value.skipped !== 'boolean') return false;
  const highestLimit = Math.max(lot.openingBid, ...lot.opponents.map(opponent => opponent.limit));
  const maxBids = 2 + Math.floor((highestLimit - lot.openingBid) / Math.max(1, lot.bidIncrement));
  if (Object.keys(value).length !== 3 || value.bids.length > maxBids) return false;
  const replay: string[] = [];
  for (const id of value.bids) {
    const { ask, leader, next } = offerAt(lot, seed, { ...initialRound, bids: replay }, advance);
    if (id === leader || (id === 'player' ? ask > bank : !next || id !== next.id)) return false;
    replay.push(id);
  }
  const current = value as OpenRound;
  const next = offerAt(lot, seed, current, advance).next;
  return !(current.skipped && replay.at(-1) === 'player') && (!next || current.elapsed < next.delay);
}
