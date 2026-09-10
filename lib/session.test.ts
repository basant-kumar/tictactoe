import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSession,
  getCelebrationTier,
  getStatusMessage,
  normalizeName,
  sessionReducer,
  type SessionState,
} from './session.ts';

const X_WIN = [0, 3, 1, 4, 2];
const O_WIN = [0, 3, 1, 4, 8, 5];
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8];

function playMoves(session: SessionState, moves: number[]): SessionState {
  return moves.reduce(
    (current, index) => sessionReducer(current, { type: 'move', index }),
    session,
  );
}

function rename(session: SessionState, player: 'X' | 'O', name: string) {
  return sessionReducer(session, { type: 'rename', player, name });
}

void test('creates a fresh X-first session with default names and status', () => {
  const session = createSession();

  assert.deepEqual(session.names, { X: 'Player X', O: 'Player O' });
  assert.deepEqual(session.stats, {
    X: { wins: 0, currentStreak: 0, bestStreak: 0 },
    O: { wins: 0, currentStreak: 0, bestStreak: 0 },
  });
  assert.equal(session.draws, 0);
  assert.equal(session.roundId, 0);
  assert.equal(session.celebration, null);
  assert.equal(session.game.status, 'playing');
  assert.equal(getStatusMessage(session), 'Player X’s turn');
});

void test('records wins, draws, streak breaks, tiers, and round identity', () => {
  let session = createSession();

  for (let win = 0; win < 3; win += 1) {
    session = playMoves(session, X_WIN);

    assert.equal(session.stats.X.wins, win + 1);
    assert.equal(session.stats.X.currentStreak, win + 1);
    assert.equal(session.stats.X.bestStreak, win + 1);
    assert.equal(session.stats.O.currentStreak, 0);

    if (win < 2) {
      session = sessionReducer(session, { type: 'restart-round' });
    }
  }

  assert.equal(session.roundId, 2);
  assert.deepEqual(session.celebration, {
    roundId: 2,
    player: 'X',
    streak: 3,
    tier: { id: 'on-fire', label: 'On fire', minStreak: 3 },
  });
  assert.equal(getStatusMessage(session), 'Player X wins!');

  const celebration = session.celebration;
  const renamed = rename(session, 'X', '  Alex  ');
  assert.strictEqual(renamed.game, session.game);
  assert.strictEqual(renamed.stats, session.stats);
  assert.strictEqual(renamed.celebration, celebration);
  assert.equal(getStatusMessage(renamed), 'Alex wins!');

  session = sessionReducer(renamed, { type: 'restart-round' });
  session = playMoves(session, DRAW);
  assert.equal(session.draws, 1);
  assert.equal(session.stats.X.currentStreak, 3);
  assert.equal(session.stats.O.currentStreak, 0);
  assert.equal(session.celebration, null);
  assert.equal(getStatusMessage(session), 'It’s a draw.');

  session = sessionReducer(session, { type: 'restart-round' });
  session = playMoves(session, O_WIN);
  assert.deepEqual(session.stats, {
    X: { wins: 3, currentStreak: 0, bestStreak: 3 },
    O: { wins: 1, currentStreak: 1, bestStreak: 1 },
  });
  assert.equal(session.celebration, null);
  assert.equal(getStatusMessage(session), 'Player O wins!');

  session = sessionReducer(session, { type: 'restart-round' });
  session = playMoves(session, X_WIN);
  assert.deepEqual(session.stats, {
    X: { wins: 4, currentStreak: 1, bestStreak: 3 },
    O: { wins: 1, currentStreak: 0, bestStreak: 1 },
  });
});

void test('returns the exact state for invalid, occupied, and terminal moves', () => {
  const initial = createSession();
  for (const index of [-1, 9, 1.5, Number.NaN]) {
    assert.strictEqual(
      sessionReducer(initial, { type: 'move', index }),
      initial,
    );
  }

  const occupied = sessionReducer(initial, { type: 'move', index: 0 });
  assert.strictEqual(
    sessionReducer(occupied, { type: 'move', index: 0 }),
    occupied,
  );

  const won = playMoves(createSession(), X_WIN);
  const statsAfterWin = won.stats;
  const rejected = sessionReducer(won, { type: 'move', index: 5 });
  assert.strictEqual(rejected, won);
  assert.strictEqual(rejected.stats, statsAfterWin);
  assert.equal(rejected.stats.X.wins, 1);
});

void test('normalizes blank, capped, and HTML-like names during live edits', () => {
  const fortyAs = 'A'.repeat(40);
  assert.equal(normalizeName('X', '   '), 'Player X');
  assert.equal(normalizeName('O', '\t\n'), 'Player O');
  assert.equal(normalizeName('X', `  ${fortyAs}  `), 'A'.repeat(24));
  assert.equal(normalizeName('O', '  <b>Ada</b>  '), '<b>Ada</b>');

  let session = createSession();
  session = rename(session, 'X', '   ');
  session = rename(session, 'O', `  ${fortyAs}  `);
  assert.deepEqual(session.names, { X: 'Player X', O: 'A'.repeat(24) });

  session = playMoves(session, [0]);
  session = rename(session, 'O', '  Ada  ');
  session = playMoves(session, [4]);
  assert.equal(getStatusMessage(session), 'Player X’s turn');
  assert.equal(session.names.O, 'Ada');
});

void test('restarts active and completed rounds, and reset preserves names only', () => {
  let session = rename(createSession(), 'X', 'Alice');
  session = rename(session, 'O', 'Bob');
  session = playMoves(session, X_WIN);
  const completedRoundId = session.roundId;

  const restarted = sessionReducer(session, { type: 'restart-round' });
  assert.notStrictEqual(restarted.game, session.game);
  assert.deepEqual(restarted.names, { X: 'Alice', O: 'Bob' });
  assert.deepEqual(restarted.stats, session.stats);
  assert.equal(restarted.draws, session.draws);
  assert.equal(restarted.roundId, completedRoundId + 1);
  assert.equal(restarted.celebration, null);

  const active = sessionReducer(restarted, { type: 'move', index: 0 });
  const reset = sessionReducer(active, { type: 'reset-session' });
  assert.deepEqual(reset.names, { X: 'Alice', O: 'Bob' });
  assert.deepEqual(reset.stats, {
    X: { wins: 0, currentStreak: 0, bestStreak: 0 },
    O: { wins: 0, currentStreak: 0, bestStreak: 0 },
  });
  assert.equal(reset.draws, 0);
  assert.equal(reset.roundId, restarted.roundId + 1);
  assert.deepEqual(reset.game.board, Array(9).fill(null));
  assert.equal(reset.celebration, null);

  const completedReset = sessionReducer(session, { type: 'reset-session' });
  assert.deepEqual(completedReset.names, { X: 'Alice', O: 'Bob' });
  assert.equal(completedReset.celebration, null);
  assert.equal(completedReset.stats.X.wins, 0);
});

void test('does not mutate prior session objects and saturates counters', () => {
  const initial = createSession();
  const afterMove = sessionReducer(initial, { type: 'move', index: 0 });
  assert.deepEqual(initial.game.board, Array(9).fill(null));
  assert.equal(initial.game.currentPlayer, 'X');
  assert.notStrictEqual(afterMove, initial);
  assert.notStrictEqual(afterMove.game, initial.game);

  const max = Number.MAX_SAFE_INTEGER;
  const nearMax: SessionState = {
    ...createSession(),
    stats: {
      X: { wins: max, currentStreak: max, bestStreak: max },
      O: { wins: 0, currentStreak: 0, bestStreak: 0 },
    },
    draws: max,
  };
  const maxWin = playMoves(nearMax, X_WIN);
  assert.deepEqual(maxWin.stats.X, {
    wins: max,
    currentStreak: max,
    bestStreak: max,
  });

  const maxDraw = playMoves(
    { ...nearMax, game: createSession().game },
    DRAW,
  );
  assert.equal(maxDraw.draws, max);
});

void test('maps every streak tier boundary', () => {
  const expected = [
    null,
    null,
    null,
    { id: 'on-fire', label: 'On fire', minStreak: 3 },
    { id: 'unstoppable', label: 'Unstoppable', minStreak: 4 },
    { id: 'dominating', label: 'Dominating', minStreak: 5 },
    { id: 'legendary', label: 'Legendary', minStreak: 6 },
    { id: 'legendary', label: 'Legendary', minStreak: 6 },
    { id: 'legendary', label: 'Legendary', minStreak: 6 },
  ];

  for (let streak = 0; streak <= 8; streak += 1) {
    assert.deepEqual(getCelebrationTier(streak), expected[streak]);
  }
});
