'use client';

import { useEffect, useReducer, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';

import { createCellActivation } from '@/lib/cell-activation';
import {
  getStatusMessage,
  NAME_LIMIT,
  normalizeName,
  sessionReducer,
  type Celebration,
  type Player,
} from '@/lib/session';
import { loadSession, saveSession } from '@/lib/session-storage';

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

const storageProvider = () =>
  typeof window === 'undefined' ? undefined : window.localStorage;

function getNativePointerType(
  event: ReactMouseEvent<HTMLButtonElement>,
): string | undefined {
  const nativeEvent: Event = event.nativeEvent;

  if (!('pointerType' in nativeEvent)) {
    return undefined;
  }

  const pointerType: unknown = Reflect.get(nativeEvent, 'pointerType');
  return typeof pointerType === 'string' ? pointerType : undefined;
}

function celebrationParticleCount(celebration: Celebration): number {
  switch (celebration.tier.id) {
    case 'on-fire':
      return 6;
    case 'unstoppable':
      return 12;
    case 'dominating':
      return 18;
    case 'legendary':
      return Math.min(40, 24 + Math.max(0, celebration.streak - 6) * 4);
  }
}

function celebrationParticleStyle(index: number): CSSProperties {
  return { '--particle-index': index } as CSSProperties;
}

export default function Home() {
  const [session, dispatch] = useReducer(
    sessionReducer,
    undefined,
    () => loadSession(storageProvider),
  );
  const [cellActivation] = useState(() =>
    createCellActivation((index) => dispatch({ type: 'move', index })),
  );
  const [nameDrafts, setNameDrafts] = useState<Record<Player, string>>(() => ({
    X: session.names.X,
    O: session.names.O,
  }));

  useEffect(() => {
    saveSession(storageProvider, session);
  }, [session]);

  const statusMessage = getStatusMessage(session);
  const isGameOver = session.game.status !== 'playing';
  const celebration = session.celebration;
  const particleCount = celebration ? celebrationParticleCount(celebration) : 0;

  const updateName = (player: Player, value: string) => {
    const boundedName = value.slice(0, NAME_LIMIT);

    setNameDrafts((current) => ({ ...current, [player]: boundedName }));
    dispatch({ type: 'rename', player, name: boundedName });
  };

  const normalizeDraft = (player: Player) => {
    const normalizedName = normalizeName(player, nameDrafts[player]);

    setNameDrafts((current) => ({ ...current, [player]: normalizedName }));
    dispatch({ type: 'rename', player, name: normalizedName });
  };

  const playerState = (player: Player) => {
    if (isGameOver) {
      return 'Round complete';
    }

    return session.game.currentPlayer === player ? 'Current turn' : 'Waiting';
  };

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

        <div className="game-layout">
          <section className="game-area" aria-label="Game play">
            <section className="game-card" aria-label="Tic-tac-toe game">
              <div className="player-bar" aria-label="Players">
                <div
                  className={`player player-x${session.game.currentPlayer === 'X' && !isGameOver ? ' active' : ''}`}
                  aria-current={
                    session.game.currentPlayer === 'X' && !isGameOver
                      ? 'true'
                      : undefined
                  }
                  aria-label={`${session.names.X} (X), ${playerState('X')}`}
                >
                  <span className="player-symbol" aria-hidden="true">
                    X
                  </span>
                  <span className="player-copy">
                    <span className="player-label" title={session.names.X}>
                      {session.names.X}
                    </span>
                    <span className="player-state">{playerState('X')}</span>
                  </span>
                </div>
                <span className="versus" aria-hidden="true">
                  VS
                </span>
                <div
                  className={`player player-o${session.game.currentPlayer === 'O' && !isGameOver ? ' active' : ''}`}
                  aria-current={
                    session.game.currentPlayer === 'O' && !isGameOver
                      ? 'true'
                      : undefined
                  }
                  aria-label={`${session.names.O} (O), ${playerState('O')}`}
                >
                  <span className="player-symbol" aria-hidden="true">
                    O
                  </span>
                  <span className="player-copy">
                    <span className="player-label" title={session.names.O}>
                      {session.names.O}
                    </span>
                    <span className="player-state">{playerState('O')}</span>
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
                  className={`game-status ${session.game.status}`}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {statusMessage}
                </output>
              </div>

              <div className="board" aria-label="Tic-tac-toe board">
                {session.game.board.map((cell, index) => {
                  const isWinningCell = session.game.winningCells.includes(index);
                  const cellLabel = cell
                    ? `${CELL_NAMES[index]} cell, occupied by ${session.names[cell]} (${cell})`
                    : `${CELL_NAMES[index]} cell, empty`;

                  return (
                    <button
                      key={CELL_NAMES[index]}
                      type="button"
                      className={`cell${cell ? ` mark-${cell.toLowerCase()}` : ''}${isWinningCell ? ' winning' : ''}`}
                      onPointerDown={(event) =>
                        cellActivation.onPointerDown(index, event)
                      }
                      onClick={(event) =>
                        cellActivation.onClick(index, {
                          pointerType: getNativePointerType(event),
                          detail: event.detail,
                          button: event.button,
                          preventDefault: () => event.preventDefault(),
                        })
                      }
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

            <div className="round-controls">
              <button
                className="restart-button"
                type="button"
                onClick={() => dispatch({ type: 'restart-round' })}
              >
                <span className="restart-icon" aria-hidden="true">
                  ↻
                </span>
                Restart round
              </button>
              <button
                className="reset-session-button"
                type="button"
                aria-describedby="reset-session-note"
                onClick={() => dispatch({ type: 'reset-session' })}
              >
                Reset session
              </button>
              <p className="reset-session-note" id="reset-session-note">
                Clears scores and draws, but keeps player names.
              </p>
            </div>

            <p className="keyboard-note">
              Tab to a cell, then press Enter or Space.
            </p>

            <div
              className="celebration"
              aria-live="polite"
              aria-atomic="true"
            >
              {celebration ? (
                <output
                  key={celebration.roundId}
                  className="celebration-message"
                  data-round-id={celebration.roundId}
                  data-tier={celebration.tier.id}
                  data-player={celebration.player}
                  data-particles={particleCount}
                >
                  <span className="celebration-effects" aria-hidden="true">
                    <span className="celebration-glow" />
                    {celebration.tier.id === 'unstoppable' ||
                    celebration.tier.id === 'dominating' ? (
                      <span className="celebration-ring celebration-ring-one" />
                    ) : null}
                    {celebration.tier.id === 'dominating' ? (
                      <span className="celebration-ring celebration-ring-two" />
                    ) : null}
                    {celebration.tier.id === 'legendary' ? (
                      <>
                        <span className="celebration-rays" />
                        <span className="celebration-crown">♛</span>
                      </>
                    ) : null}
                    <span className="celebration-sparks">
                      {Array.from({ length: particleCount }, (_, index) => (
                        <span
                          key={index}
                          className="celebration-spark"
                          style={celebrationParticleStyle(index)}
                        />
                      ))}
                    </span>
                  </span>
                  <span>
                    {session.names[celebration.player]} ({celebration.player})
                  </span>{' '}
                  <span>{celebration.streak}-win streak</span>{' '}
                  <span>{celebration.tier.label}</span>
                </output>
              ) : null}
            </div>
          </section>

          <aside className="session-panel" aria-labelledby="session-title">
            <h2 id="session-title">Session scores</h2>
            <p className="session-description">
              Names and scores stay available for this browser session.
            </p>

            <div className="session-players">
              <section
                className="session-player"
                data-player="X"
                aria-labelledby="player-x-heading"
              >
                <div className="session-player-heading">
                  <h3 id="player-x-heading" title={session.names.X}>
                    <span aria-hidden="true">X</span> {session.names.X}
                  </h3>
                  <span className="session-player-turn">
                    {playerState('X')}
                  </span>
                </div>
                <label htmlFor="player-x-name">Player X name</label>
                <input
                  id="player-x-name"
                  name="player-x-name"
                  type="text"
                  value={nameDrafts.X}
                  maxLength={NAME_LIMIT}
                  autoComplete="off"
                  onChange={(event) =>
                    updateName('X', event.currentTarget.value)
                  }
                  onBlur={() => normalizeDraft('X')}
                />
                <dl className="stats-list">
                  <div>
                    <dt>Wins</dt>
                    <dd data-stat="wins">{session.stats.X.wins}</dd>
                  </div>
                  <div>
                    <dt>Current streak</dt>
                    <dd data-stat="current-streak">
                      {session.stats.X.currentStreak}
                    </dd>
                  </div>
                  <div>
                    <dt>Best streak</dt>
                    <dd data-stat="best-streak">
                      {session.stats.X.bestStreak}
                    </dd>
                  </div>
                </dl>
              </section>

              <section
                className="session-player"
                data-player="O"
                aria-labelledby="player-o-heading"
              >
                <div className="session-player-heading">
                  <h3 id="player-o-heading" title={session.names.O}>
                    <span aria-hidden="true">O</span> {session.names.O}
                  </h3>
                  <span className="session-player-turn">
                    {playerState('O')}
                  </span>
                </div>
                <label htmlFor="player-o-name">Player O name</label>
                <input
                  id="player-o-name"
                  name="player-o-name"
                  type="text"
                  value={nameDrafts.O}
                  maxLength={NAME_LIMIT}
                  autoComplete="off"
                  onChange={(event) =>
                    updateName('O', event.currentTarget.value)
                  }
                  onBlur={() => normalizeDraft('O')}
                />
                <dl className="stats-list">
                  <div>
                    <dt>Wins</dt>
                    <dd data-stat="wins">{session.stats.O.wins}</dd>
                  </div>
                  <div>
                    <dt>Current streak</dt>
                    <dd data-stat="current-streak">
                      {session.stats.O.currentStreak}
                    </dd>
                  </div>
                  <div>
                    <dt>Best streak</dt>
                    <dd data-stat="best-streak">
                      {session.stats.O.bestStreak}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <dl className="shared-stats">
              <div>
                <dt>Draws</dt>
                <dd data-stat="draws">{session.draws}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  );
}
