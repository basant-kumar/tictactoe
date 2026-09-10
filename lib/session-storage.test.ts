import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSession,
  sessionReducer,
  type SessionState,
} from './session.ts';
import {
  loadSession,
  saveSession,
  STORAGE_KEY,
  type StoragePort,
} from './session-storage.ts';

function createMemoryStorage(initial: string | null = null) {
  let value = initial;
  const storage: StoragePort = {
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, STORAGE_KEY);
      value = nextValue;
    },
  };

  return {
    storage,
    read: () => value,
    write: (nextValue: string | null) => {
      value = nextValue;
    },
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: 1,
    names: { X: 'Alice', O: 'Bob' },
    stats: {
      X: { wins: 2, currentStreak: 2, bestStreak: 2 },
      O: { wins: 1, currentStreak: 0, bestStreak: 1 },
    },
    draws: 4,
    ...overrides,
  });
}

function loadJson(json: string) {
  const memory = createMemoryStorage(json);
  return loadSession(() => memory.storage);
}

function playMoves(session: SessionState, moves: number[]): SessionState {
  return moves.reduce(
    (current, index) => sessionReducer(current, { type: 'move', index }),
    session,
  );
}

void test('round-trips only normalized persistent fields into a fresh round', () => {
  let session = createSession();
  session = sessionReducer(session, {
    type: 'rename',
    player: 'X',
    name: '  Alice  ',
  });
  session = sessionReducer(session, {
    type: 'rename',
    player: 'O',
    name: '  Bob  ',
  });
  session = playMoves(session, [0, 3, 1, 4, 2]);
  session = sessionReducer(session, { type: 'restart-round' });
  session = playMoves(session, [0, 1, 2, 4, 3, 5, 7, 6, 8]);

  const memory = createMemoryStorage();
  assert.equal(saveSession(() => memory.storage, session), true);
  assert.deepEqual(JSON.parse(memory.read() ?? ''), {
    version: 1,
    names: { X: 'Alice', O: 'Bob' },
    stats: {
      X: { wins: 1, currentStreak: 1, bestStreak: 1 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    draws: 1,
  });

  const loaded = loadSession(() => memory.storage);
  assert.deepEqual(loaded.names, session.names);
  assert.deepEqual(loaded.stats, session.stats);
  assert.equal(loaded.draws, session.draws);
  assert.deepEqual(loaded.game, createSession().game);
  assert.equal(loaded.roundId, 0);
  assert.equal(loaded.celebration, null);
});

void test('uses playable defaults when storage is unavailable or malformed', () => {
  assert.deepEqual(loadSession(() => undefined), createSession());

  for (const malformed of [
    '{',
    JSON.stringify({ version: 2, names: { X: 'Bad' } }),
    JSON.stringify([]),
    JSON.stringify(null),
  ]) {
    assert.deepEqual(loadJson(malformed), createSession());
  }
});

void test('normalizes every supported-version name fixture independently', () => {
  const fortyAs = 'A'.repeat(40);
  const fixtures = [
    { names: { X: '   ', O: '  Ada Lovelace  ' }, expected: { X: 'Player X', O: 'Ada Lovelace' } },
    { names: { X: `  ${fortyAs}  `, O: '  Bob  ' }, expected: { X: 'A'.repeat(24), O: 'Bob' } },
    { names: { X: 42, O: '   ' }, expected: { X: 'Player X', O: 'Player O' } },
  ];

  for (const fixture of fixtures) {
    const loaded = loadJson(payload({ names: fixture.names }));
    assert.deepEqual(loaded.names, fixture.expected);
    assert.ok(Object.values(loaded.names).every((name) => name.length <= 24));
    assert.ok(Object.values(loaded.names).every((name) => name.trim().length > 0));
  }
});

void test('resets invalid statistics as a scoreboard while retaining valid names', () => {
  const invalidStats = [
    {
      X: { wins: -1, currentStreak: 0, bestStreak: 0 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    {
      X: { wins: 1.5, currentStreak: 0, bestStreak: 0 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    {
      X: { wins: Number.MAX_SAFE_INTEGER + 1, currentStreak: 0, bestStreak: 0 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    {
      X: { wins: 1, currentStreak: 1, bestStreak: 0 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    {
      X: { wins: 1, currentStreak: 0, bestStreak: 2 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    {
      X: { wins: 1, currentStreak: 1, bestStreak: 1 },
      O: { wins: 1, currentStreak: 1, bestStreak: 1 },
    },
  ];

  for (const stats of invalidStats) {
    const loaded = loadJson(payload({ stats, draws: -2 }));
    assert.deepEqual(loaded.names, { X: 'Alice', O: 'Bob' });
    assert.deepEqual(loaded.stats, createSession().stats);
    assert.equal(loaded.draws, 0);
  }

  const invalidStatsWithValidDraws = loadJson(payload({
    stats: {
      X: { wins: -1, currentStreak: 0, bestStreak: 0 },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    draws: 7,
  }));
  assert.deepEqual(invalidStatsWithValidDraws.names, { X: 'Alice', O: 'Bob' });
  assert.deepEqual(invalidStatsWithValidDraws.stats, createSession().stats);
  assert.equal(invalidStatsWithValidDraws.draws, 0);
});

void test('accepts valid safe counters and resets the scoreboard for malformed draws', () => {
  const loaded = loadJson(payload({
    stats: {
      X: { wins: Number.MAX_SAFE_INTEGER, currentStreak: 0, bestStreak: Number.MAX_SAFE_INTEGER },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    draws: Number.MAX_SAFE_INTEGER,
  }));
  assert.equal(loaded.stats.X.wins, Number.MAX_SAFE_INTEGER);
  assert.equal(loaded.stats.X.bestStreak, Number.MAX_SAFE_INTEGER);
  assert.equal(loaded.draws, Number.MAX_SAFE_INTEGER);

  const malformedDraws = loadJson(payload({ draws: 1.25 }));
  assert.deepEqual(malformedDraws.stats, createSession().stats);
  assert.equal(malformedDraws.draws, 0);
});

void test('handles throwing providers and failed writes without throwing or mutating state', () => {
  assert.deepEqual(
    loadSession(() => {
      throw new Error('provider unavailable');
    }),
    createSession(),
  );

  const throwingReader: StoragePort = {
    getItem() {
      throw new Error('read failed');
    },
    setItem() {
      throw new Error('write failed');
    },
  };
  assert.deepEqual(loadSession(() => throwingReader), createSession());

  const session = playMoves(createSession(), [0, 3, 1, 4, 2]);
  const before = structuredClone(session);
  assert.equal(saveSession(() => undefined, session), false);
  assert.deepEqual(session, before);
  assert.equal(saveSession(() => throwingReader, session), false);
  assert.deepEqual(session, before);
});
