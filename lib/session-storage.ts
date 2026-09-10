import {
  createSession,
  normalizeName,
  type PlayerStats,
  type SessionState,
} from './session.ts';
import type { Player } from './tic-tac-toe.ts';

export const STORAGE_KEY = 'tictactoe.session.v1';

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizedStoredName(
  names: unknown,
  player: Player,
): string {
  if (!isRecord(names) || !hasOwn(names, player)) {
    return normalizeName(player, '');
  }

  const storedName = names[player];
  return typeof storedName === 'string'
    ? normalizeName(player, storedName)
    : normalizeName(player, '');
}

function isSafeCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parsePlayerStats(value: unknown): PlayerStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const wins = value.wins;
  const currentStreak = value.currentStreak;
  const bestStreak = value.bestStreak;

  if (
    !isSafeCounter(wins) ||
    !isSafeCounter(currentStreak) ||
    !isSafeCounter(bestStreak) ||
    currentStreak > bestStreak ||
    bestStreak > wins
  ) {
    return null;
  }

  return { wins, currentStreak, bestStreak };
}

function parseStats(value: unknown): Record<Player, PlayerStats> | null {
  if (!isRecord(value) || !hasOwn(value, 'X') || !hasOwn(value, 'O')) {
    return null;
  }

  const xStats = parsePlayerStats(value.X);
  const oStats = parsePlayerStats(value.O);

  if (xStats === null || oStats === null) {
    return null;
  }

  if (xStats.currentStreak > 0 && oStats.currentStreak > 0) {
    return null;
  }

  return { X: xStats, O: oStats };
}

function restoreSupportedSession(value: UnknownRecord): SessionState {
  const fresh = createSession();
  const names = {
    X: normalizedStoredName(value.names, 'X'),
    O: normalizedStoredName(value.names, 'O'),
  };
  const stats = parseStats(value.stats);

  if (stats === null || !isSafeCounter(value.draws)) {
    return {
      ...fresh,
      names,
      stats: fresh.stats,
      draws: 0,
    };
  }

  return {
    ...fresh,
    names,
    stats,
    draws: value.draws,
  };
}

export function loadSession(
  getStorage: () => StoragePort | undefined,
): SessionState {
  try {
    const storage = getStorage();

    if (storage === undefined) {
      return createSession();
    }

    const storedValue = storage.getItem(STORAGE_KEY);

    if (storedValue === null || typeof storedValue !== 'string') {
      return createSession();
    }

    const parsed: unknown = JSON.parse(storedValue);

    if (!isRecord(parsed) || !hasOwn(parsed, 'version') || parsed.version !== 1) {
      return createSession();
    }

    return restoreSupportedSession(parsed);
  } catch {
    return createSession();
  }
}

export function saveSession(
  getStorage: () => StoragePort | undefined,
  state: SessionState,
): boolean {
  try {
    const storage = getStorage();

    if (storage === undefined) {
      return false;
    }

    const payload = {
      version: 1,
      names: {
        X: normalizeName('X', state.names.X),
        O: normalizeName('O', state.names.O),
      },
      stats: {
        X: {
          wins: state.stats.X.wins,
          currentStreak: state.stats.X.currentStreak,
          bestStreak: state.stats.X.bestStreak,
        },
        O: {
          wins: state.stats.O.wins,
          currentStreak: state.stats.O.currentStreak,
          bestStreak: state.stats.O.bestStreak,
        },
      },
      draws: state.draws,
    };

    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
