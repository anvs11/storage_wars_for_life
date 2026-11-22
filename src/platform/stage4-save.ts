import { canOpenRelationship, isRelationshipStep } from '../game/relationships';
import type { Stage4Command } from '../game/stage4-contract';
import { applyCommand, migrateStage3 } from '../game/stage4-engine';
import type { GameEconomy } from '../game/stage3-engine';
import type { Stage4State } from '../game/stage4-engine';
import { exactKeys, isRecord, loadSnapshot, writeSnapshot } from './save';
import type { LoadResult, SavedCommandResult, SaveResult, SaveStorage } from './save';
import { decodeStage3Snapshot, isStage3State } from './stage3-save';

const version = 3;

export function isStage4State(value: unknown, economy?: GameEconomy, rubles = false): value is Stage4State {
  if (!isRecord(value) || !exactKeys(value, ['game', 'relationshipStep', 'relationshipOpen'])) return false;
  const { game, relationshipStep, relationshipOpen } = value;
  if (!isStage3State(game, economy, rubles) || !isRelationshipStep(relationshipStep, game.status, game.assets)) return false;
  return relationshipOpen === false ||
    (relationshipOpen === true && game.phase === 'hub' && canOpenRelationship(game.status));
}

export function decodeStage4(serialized: string | null): Stage4State | null {
  if (serialized === null) return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value)) return null;
    if (value.version === version) return isStage4State(value.state) ? value.state : null;
    const legacy = decodeStage3Snapshot(value);
    return legacy ? migrateStage3(legacy) : null;
  } catch {
    return null;
  }
}

export function load(storage: SaveStorage): LoadResult<Stage4State> {
  return loadSnapshot(storage, decodeStage4);
}

export function save(storage: SaveStorage, state: Stage4State): SaveResult {
  return writeSnapshot(storage, { version, state }, decodeStage4);
}

export function applySavedCommand(
  storage: SaveStorage, state: Stage4State, command: Stage4Command,
): SavedCommandResult<Stage4State> {
  const next = applyCommand(state, command);
  if (next === state) return { kind: 'ignored', state };
  const result = save(storage, next);
  return result.ok ? { kind: 'saved', state: next } : { kind: 'failed', state, message: result.message };
}
