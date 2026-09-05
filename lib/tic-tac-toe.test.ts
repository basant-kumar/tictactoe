import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGame,
  playMove,
  restartGame,
  WINNING_LINES,
  type GameState,
} from './tic-tac-toe.ts';

function playMoves(moves: number[]) {
  return moves.reduce(
    (game, cellIndex) => playMove(game, cellIndex),
    createGame(),
  );
}

function hasWinningLine(cells: number[]) {
  return WINNING_LINES.some((line) =>
    line.every((cellIndex) => cells.includes(cellIndex)),
  );
}

function findSafeFillers(targetLine: readonly number[]) {
  const candidates = Array.from({ length: 9 }, (_, index) => index).filter(
    (index) => !targetLine.some((targetCell) => targetCell === index),
  );

  for (const first of candidates) {
    for (const second of candidates) {
      for (const third of candidates) {
        const fillers = [first, second, third];

        if (
          new Set(fillers).size === fillers.length &&
          !hasWinningLine(fillers)
        ) {
          return fillers;
        }
      }
    }
  }

  throw new Error('Could not find safe filler cells');
}

void test('starts with an empty board and alternates X then O', () => {
  const initial = createGame();
  assert.deepEqual(initial.board, Array(9).fill(null));
  assert.equal(initial.currentPlayer, 'X');

  const afterX = playMove(initial, 0);
  assert.equal(afterX.board[0], 'X');
  assert.equal(afterX.currentPlayer, 'O');

  const afterO = playMove(afterX, 4);
  assert.equal(afterO.board[4], 'O');
  assert.equal(afterO.currentPlayer, 'X');
});

void test('rejects an occupied cell without changing the game', () => {
  const afterX = playMove(createGame(), 0);
  const rejected = playMove(afterX, 0);

  assert.strictEqual(rejected, afterX);
  assert.equal(rejected.board[0], 'X');
  assert.equal(rejected.currentPlayer, 'O');
});

void test('detects every winning line for X', () => {
  for (const line of WINNING_LINES) {
    const fillers = [0, 1, 2, 3, 4, 5].filter(
      (cellIndex) => !line.some((lineCell) => lineCell === cellIndex),
    );
    const game = playMoves([line[0], fillers[0], line[1], fillers[1], line[2]]);

    assert.equal(game.status, 'won');
    assert.equal(game.winner, 'X');
    assert.deepEqual(game.winningCells, [...line]);
  }
});

void test('detects every winning line for O', () => {
  for (const line of WINNING_LINES) {
    const fillers = findSafeFillers(line);
    const game = playMoves([
      fillers[0],
      line[0],
      fillers[1],
      line[1],
      fillers[2],
      line[2],
    ]);

    assert.equal(game.status, 'won');
    assert.equal(game.winner, 'O');
    assert.deepEqual(game.winningCells, [...line]);
  }
});

void test('detects a draw when all cells are filled without a winner', () => {
  const game = playMoves([0, 1, 2, 4, 3, 5, 7, 6, 8]);

  assert.equal(game.status, 'draw');
  assert.equal(game.winner, null);
  assert.deepEqual(game.winningCells, []);
  assert.ok(game.board.every((cell) => cell !== null));
});

void test('rejects moves after a win or draw', () => {
  const won = playMoves([0, 3, 1, 4, 2]);
  const wonRejected = playMove(won, 5);
  assert.strictEqual(wonRejected, won);

  const draw = playMoves([0, 1, 2, 4, 3, 5, 7, 6, 8]);
  const drawRejected = playMove(draw, 0);
  assert.strictEqual(drawRejected, draw);
});

void test('restart clears an active game and restores X first', () => {
  const active = playMoves([0, 4, 1]);
  const restarted = restartGame(active);

  assert.deepEqual(restarted, createGame());
});

void test('restart clears a completed game and its winning cells', () => {
  const completed = playMoves([0, 3, 1, 4, 2]);
  assert.equal(completed.status, 'won');
  assert.deepEqual(completed.winningCells, [0, 1, 2]);

  const restarted = restartGame(completed);
  assert.deepEqual(restarted, createGame());
});

void test('ignores invalid cell indexes', () => {
  const initial: GameState = createGame();

  assert.strictEqual(playMove(initial, -1), initial);
  assert.strictEqual(playMove(initial, 9), initial);
  assert.strictEqual(playMove(initial, 1.5), initial);
});
