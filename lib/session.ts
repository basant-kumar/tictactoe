import {
  createGame,
  playMove,
  type GameState,
  type Player,
} from './tic-tac-toe.ts';

export const NAME_LIMIT = 24;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

export interface PlayerStats {
  wins: number;
  currentStreak: number;
  bestStreak: number;
}

export interface CelebrationTier {
  id: 'on-fire' | 'unstoppable' | 'dominating' | 'legendary';
  label: string;
  minStreak: number;
}

export interface Celebration {
  roundId: number;
  player: Player;
  streak: number;
  tier: CelebrationTier;
}

export interface SessionState {
  game: GameState;
  names: Record<Player, string>;
  stats: Record<Player, PlayerStats>;
  draws: number;
  roundId: number;
  celebration: Celebration | null;
}

export type SessionAction =
  | { type: 'move'; index: number }
  | { type: 'rename'; player: Player; name: string }
  | { type: 'restart-round' }
  | { type: 'reset-session' };

const CELEBRATION_TIERS: readonly CelebrationTier[] = [
  { id: 'on-fire', label: 'On fire', minStreak: 3 },
  { id: 'unstoppable', label: 'Unstoppable', minStreak: 4 },
  { id: 'dominating', label: 'Dominating', minStreak: 5 },
  { id: 'legendary', label: 'Legendary', minStreak: 6 },
];

function otherPlayer(player: Player): Player {
  return player === 'X' ? 'O' : 'X';
}

function incrementCounter(value: number): number {
  return value >= MAX_COUNTER ? MAX_COUNTER : value + 1;
}

function createStats(): Record<Player, PlayerStats> {
  return {
    X: { wins: 0, currentStreak: 0, bestStreak: 0 },
    O: { wins: 0, currentStreak: 0, bestStreak: 0 },
  };
}

export function normalizeName(player: Player, value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0
    ? trimmed.slice(0, NAME_LIMIT)
    : `Player ${player}`;
}

export function getCelebrationTier(streak: number): CelebrationTier | null {
  if (!Number.isFinite(streak) || streak < CELEBRATION_TIERS[0].minStreak) {
    return null;
  }

  if (streak >= CELEBRATION_TIERS[3].minStreak) {
    return CELEBRATION_TIERS[3];
  }

  if (streak >= CELEBRATION_TIERS[2].minStreak) {
    return CELEBRATION_TIERS[2];
  }

  if (streak >= CELEBRATION_TIERS[1].minStreak) {
    return CELEBRATION_TIERS[1];
  }

  return CELEBRATION_TIERS[0];
}

export function createSession(): SessionState {
  return {
    game: createGame(),
    names: {
      X: normalizeName('X', ''),
      O: normalizeName('O', ''),
    },
    stats: createStats(),
    draws: 0,
    roundId: 0,
    celebration: null,
  };
}

function recordWin(
  state: SessionState,
  game: GameState,
  winner: Player,
): SessionState {
  const loser = otherPlayer(winner);
  const previousWinnerStats = state.stats[winner];
  const currentStreak = incrementCounter(previousWinnerStats.currentStreak);
  const winnerStats: PlayerStats = {
    wins: incrementCounter(previousWinnerStats.wins),
    currentStreak,
    bestStreak: Math.max(previousWinnerStats.bestStreak, currentStreak),
  };
  const loserStats: PlayerStats = {
    ...state.stats[loser],
    currentStreak: 0,
  };
  const tier = getCelebrationTier(currentStreak);

  return {
    ...state,
    game,
    stats: {
      ...state.stats,
      [winner]: winnerStats,
      [loser]: loserStats,
    },
    celebration: tier
      ? {
          roundId: state.roundId,
          player: winner,
          streak: currentStreak,
          tier,
        }
      : null,
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  if (!action || typeof action !== 'object') {
    return state;
  }

  switch (action.type) {
    case 'move': {
      const game = playMove(state.game, action.index);

      if (game === state.game) {
        return state;
      }

      if (state.game.status !== 'playing') {
        return state;
      }

      if (game.status === 'won' && game.winner !== null) {
        return recordWin(state, game, game.winner);
      }

      if (game.status === 'draw') {
        return {
          ...state,
          game,
          draws: incrementCounter(state.draws),
          celebration: null,
        };
      }

      return {
        ...state,
        game,
      };
    }

    case 'rename':
      if (action.player !== 'X' && action.player !== 'O') {
        return state;
      }

      return {
        ...state,
        names: {
          ...state.names,
          [action.player]: normalizeName(action.player, action.name),
        },
      };

    case 'restart-round':
      return {
        ...state,
        game: createGame(),
        roundId: incrementCounter(state.roundId),
        celebration: null,
      };

    case 'reset-session':
      return {
        ...state,
        game: createGame(),
        stats: createStats(),
        draws: 0,
        roundId: incrementCounter(state.roundId),
        celebration: null,
      };

    default:
      return state;
  }
}

export function getStatusMessage(session: SessionState): string {
  if (session.game.status === 'won' && session.game.winner !== null) {
    return `${session.names[session.game.winner]} wins!`;
  }

  if (session.game.status === 'draw') {
    return 'It’s a draw.';
  }

  return `${session.names[session.game.currentPlayer]}’s turn`;
}

export type { GameState, Player } from './tic-tac-toe.ts';
