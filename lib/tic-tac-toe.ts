export type Player = 'X' | 'O';
export type Cell = Player | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const satisfies readonly (readonly [number, number, number])[];

export interface GameState {
  board: Cell[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningCells: number[];
}

export function createGame(): GameState {
  return {
    board: Array<Cell>(9).fill(null),
    currentPlayer: 'X',
    status: 'playing',
    winner: null,
    winningCells: [],
  };
}

export function restartGame(_game: GameState): GameState {
  return createGame();
}

export function playMove(game: GameState, cellIndex: number): GameState {
  if (
    game.status !== 'playing' ||
    !Number.isInteger(cellIndex) ||
    cellIndex < 0 ||
    cellIndex >= game.board.length ||
    game.board[cellIndex] !== null
  ) {
    return game;
  }

  const board = [...game.board];
  const player = game.currentPlayer;
  board[cellIndex] = player;

  const winningLine = WINNING_LINES.find(([first, second, third]) => {
    return (
      board[first] === player &&
      board[second] === player &&
      board[third] === player
    );
  });

  if (winningLine) {
    return {
      board,
      currentPlayer: player,
      status: 'won',
      winner: player,
      winningCells: [...winningLine],
    };
  }

  if (board.every((cell) => cell !== null)) {
    return {
      board,
      currentPlayer: player,
      status: 'draw',
      winner: null,
      winningCells: [],
    };
  }

  return {
    board,
    currentPlayer: player === 'X' ? 'O' : 'X',
    status: 'playing',
    winner: null,
    winningCells: [],
  };
}
