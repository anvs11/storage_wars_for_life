import { createLot } from '../game/catalog';
import { auctions, tiers } from '../game/progression';
import { draw } from '../game/random';
import { migrateLot } from '../game/stage5-economy';
import type { AuctionTier, Stage3Command } from '../game/stage3-contract';
import { applyCommand, legacyEconomy, migrateStage2 } from '../game/stage3-engine';
import type { Stage3State } from '../game/stage3-engine';
import {
  areIds, exactKeys, getSavedInventory, isGarageSnapshot, isMoney, isRecord, isStage2State,
  loadSnapshot, matches, writeSnapshot,
} from './save';
import type { LoadResult, SaveResult, SaveStorage, SavedCommandResult } from './save';

const version = 2;
const profileKeys = ['phase', 'revision', 'bank', 'status', 'lotNumber'];
const baggageKeys = [...profileKeys, 'baggageSeed', 'contents', 'openedBoxIds', 'soldItemIds'];

function isSeed(value: unknown): value is number {
  return isMoney(value) && value <= 0xffffffff;
}

function isTier(value: unknown): value is AuctionTier {
  return value === 'ordinary' || value === 'selected' || value === 'antique';
}

export function isStage3State(value: unknown, economy = legacyEconomy, rubles = false): value is Stage3State {
  if (!isRecord(value)) return false;
  const { nextSeed, offerSeeds, assets, ...core } = value;
  if (!isSeed(nextSeed) || !isRecord(offerSeeds) || !exactKeys(offerSeeds, tiers) ||
      !tiers.every((tier) => isSeed(offerSeeds[tier])) || !areIds(assets, ['home', 'car'])) return false;

  const { phase, revision, bank, status, lotNumber } = core;
  if (!isMoney(revision) || !isMoney(bank) || !isMoney(status)) return false;
  if (assets.length * 5 > status) return false;
  if (phase === 'prologue') return isStage2State(core);
  if (!isMoney(lotNumber) || (!rubles && lotNumber < 1) || lotNumber > revision) return false;

  if (phase === 'hub' || phase === 'airportOffer') return exactKeys(core, profileKeys);
  if (phase === 'baggageInventory' || phase === 'baggageResult') {
    const { baggageSeed } = core;
    if (!isSeed(baggageSeed)) return false;
    const roll = draw(baggageSeed);
    const contents = economy.baggageContents(() => roll.value);
    if (roll.seed !== nextSeed || !matches(core.contents, contents)) return false;
    const inventory = getSavedInventory(core, contents);
    if (!inventory || bank < inventory.revenue) return false;
    if (phase === 'baggageInventory') {
      return exactKeys(core, [...baggageKeys, 'purchasePrice']) && core.purchasePrice === economy.baggagePrice && inventory.hasRemaining;
    }
    return exactKeys(core, [...baggageKeys, 'receipt']) && !inventory.hasRemaining &&
      matches(core.receipt, {
        outcome: 'sold', purchasePrice: economy.baggagePrice, revenue: inventory.revenue,
        profit: inventory.revenue - economy.baggagePrice,
      });
  }

  const { tier, lotSeed, ...garage } = core;
  if (!isTier(tier)) return false;
  if (lotSeed === null) {
    return tier === 'ordinary' && (rubles
      ? isGarageSnapshot(garage, migrateLot(createLot(lotNumber)))
      : isStage2State(garage));
  }
  return isSeed(lotSeed) && status >= auctions[tier].requiredStatus &&
    (phase !== 'recovery' || tier === 'ordinary') &&
    isGarageSnapshot(garage, economy.lot(tier, lotSeed, lotNumber), economy.advancePrice, economy.openBidding);
}

export function decodeStage3Snapshot(value: unknown): Stage3State | null {
  if (!isRecord(value)) return null;
  if (value.version === 1 && isStage2State(value.state)) return migrateStage2(value.state);
  return value.version === version && isStage3State(value.state) ? value.state : null;
}

function decode(serialized: string | null): Stage3State | null {
  if (serialized === null) return null;
  try {
    return decodeStage3Snapshot(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult<Stage3State> {
  return loadSnapshot(storage, decode);
}

export function save(storage: SaveStorage, state: Stage3State): SaveResult {
  return writeSnapshot(storage, { version, state }, decode);
}

export function applySavedCommand(
  storage: SaveStorage, state: Stage3State, command: Stage3Command,
): SavedCommandResult<Stage3State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
