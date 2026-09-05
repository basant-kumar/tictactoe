'use client';

import { useState } from 'react';

import {
  createGame,
  playMove,
  restartGame,
  type GameState,
} from '@/lib/tic-tac-toe';

const CELL_NAMES = [
  'Top left',
  'Top middle',
  'Top right',
  'Middle left',
  'Center',
  'Middle right',
  'Bottom left',
  'Bottom middle',
  'Bottom right',
] as const;

function getStatusMessage(game: GameState) {
  if (game.status === 'won') {
    return `Player ${game.winner} wins!`;
  }

  if (game.status === 'draw') {
    return 'It’s a draw.';
  }

  return `Player ${game.currentPlayer}’s turn`;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => createGame());
  const statusMessage = getStatusMessage(game);
  const isGameOver = game.status !== 'playing';

  return (
    <main className="game-shell">
      <div className="game-frame">
        <header className="game-header">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">Local match / 2 players</p>
        </header>

        <section className="hero" aria-labelledby="game-title">
          <h1 id="game-title">
            Tic<span>-</span>Tac<span>-</span>Toe
          </h1>
        </section>

        <section className="game-card" aria-label="Tic-tac-toe game">
          <div className="player-bar" aria-label="Players">
            <div
              className={`player player-x${game.currentPlayer === 'X' && !isGameOver ? ' active' : ''}`}
            >
              <span className="player-symbol" aria-hidden="true">
                X
              </span>
              <span className="player-copy">
                <span className="player-label">Player one</span>
              </span>
            </div>
            <span className="versus" aria-hidden="true">
              VS
            </span>
            <div
              className={`player player-o${game.currentPlayer === 'O' && !isGameOver ? ' active' : ''}`}
            >
              <span className="player-symbol" aria-hidden="true">
                O
              </span>
              <span className="player-copy">
                <span className="player-label">Player two</span>
              </span>
            </div>
          </div>

          <div className="status-row">
            <span
              className={`status-light ${isGameOver ? 'complete' : 'live'}`}
              aria-hidden="true"
            />
            <output
              id="game-status"
              className={`game-status ${game.status}`}
              aria-live="polite"
              aria-atomic="true"
            >
              {statusMessage}
            </output>
          </div>

          <div className="board" aria-label="Tic-tac-toe board">
            {game.board.map((cell, index) => {
              const isWinningCell = game.winningCells.includes(index);
              const cellLabel = cell
                ? `${CELL_NAMES[index]} cell, occupied by player ${cell}`
                : `${CELL_NAMES[index]} cell, empty`;

              return (
                <button
                  key={CELL_NAMES[index]}
                  type="button"
                  className={`cell${cell ? ` mark-${cell.toLowerCase()}` : ''}${isWinningCell ? ' winning' : ''}`}
                  onClick={() => setGame((current) => playMove(current, index))}
                  disabled={Boolean(cell) || isGameOver}
                  aria-label={cellLabel}
                  aria-describedby="game-status"
                >
                  <span aria-hidden="true">{cell}</span>
                </button>
              );
            })}
          </div>

          <div className="card-footer">
            <span>Three in a row wins</span>
            <span className="footer-rule" aria-hidden="true" />
            <span>Choose an empty cell</span>
          </div>
        </section>

        <button
          className="restart-button"
          type="button"
          onClick={() => setGame((current) => restartGame(current))}
        >
          <span className="restart-icon" aria-hidden="true">
            ↻
          </span>
          Restart game
        </button>

        <p className="keyboard-note">
          Tab to a cell, then press Enter or Space.
        </p>
      </div>
    </main>
  );
}
