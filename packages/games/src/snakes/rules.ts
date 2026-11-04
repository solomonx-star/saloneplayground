import { jumpAt, SQUARES, WORST_SNAKE, type Jump } from "./board";

// Rules for Snakes and Ladders, with four house rules that can be switched on. One token each, one die: every roll
// moves the token (there is no choice to make), so the computer player only rolls. Pure functions so they can be
// tested and shared by the web app and the game server.

export type Colour = "red" | "blue" | "yellow" | "green";
export type Rule = "exact" | "sixAgain" | "sixStart" | "bite";
export type Rules = Record<Rule, boolean>;

// Turn order: Players 1 to 4.
export const COLOURS: Colour[] = ["red", "blue", "yellow", "green"];

export const RULES: Record<Rule, { label: string; blurb: string }> = {
  exact: { label: "Exact Roll to Finish", blurb: "You must land exactly on 100: a roll that goes past it bounces back." },
  sixAgain: { label: "Six Rolls Again", blurb: "A 6 earns another roll, but three 6s in a row end your turn without moving." },
  sixStart: { label: "Six to Start", blurb: "Your token waits off the board until you roll a 6, which puts it on square 1." },
  bite: { label: "Snake Bite", blurb: `Landing on the ${WORST_SNAKE.name} at square ${WORST_SNAKE.from} sends you right back to the start.` },
};
export const NO_RULES: Rules = { exact: false, sixAgain: false, sixStart: false, bite: false };

// Online games list computer levels; with no choices to make, there is only one.
export const LEVELS = { normal: { label: "Computer" } } as const;

export type Game = {
  rules: Rules;
  // Each player's square: 0 is off the board (before square 1), 100 is home.
  positions: number[];
  // Index of the player to roll.
  turn: number;
  // 6s rolled in a row this turn (Six Rolls Again).
  sixes: number;
  winner: number | null;
};

// What one roll did. `path` is every square the token stepped on, in order (with Exact Roll it may run up to 100 and
// back); `jump` is the snake or ladder it then took, and `to` where it ended.
export type Move = {
  player: number;
  roll: number;
  from: number;
  path: number[];
  jump: { kind: "ladder" | "snake"; jump: Jump } | null;
  to: number;
  // Six to Start: still waiting for a 6.
  waiting: boolean;
  // Exact Roll: went past 100 and came back.
  bounced: boolean;
  // Snake Bite: the worst snake sent the token back to the start.
  bitten: boolean;
  // Six Rolls Again: a third 6 ended the turn with no move.
  threeSixes: boolean;
  // The same player rolls again.
  again: boolean;
  won: boolean;
};

export function newGame(players: number, rules: Rules = NO_RULES): Game {
  const count = Math.min(4, Math.max(2, Math.round(players) || 2));
  return { rules, positions: Array.from({ length: count }, () => 0), turn: 0, sixes: 0, winner: null };
}

export const colourOf = (player: number) => COLOURS[player % COLOURS.length];

// Rolls `roll` (1–6) for the player to move. Returns the new game and what happened.
export function roll(game: Game, roll: number): { game: Game; move: Move } {
  const player = game.turn;
  const from = game.positions[player];
  const base: Move = { player, roll, from, path: [], jump: null, to: from, waiting: false, bounced: false, bitten: false, threeSixes: false, again: false, won: false };
  if (game.winner !== null) return { game, move: base };
  const { rules } = game;
  const sixes = rules.sixAgain && roll === 6 ? game.sixes + 1 : 0;
  const next = (move: Move, positions = game.positions): { game: Game; move: Move } => {
    const again = move.again;
    return {
      game: { ...game, positions, turn: again || move.won ? player : (player + 1) % game.positions.length, sixes: again ? sixes : 0, winner: move.won ? player : null },
      move,
    };
  };

  if (sixes >= 3) return next({ ...base, threeSixes: true });
  if (rules.sixStart && from === 0) {
    if (roll !== 6) return next({ ...base, waiting: true });
    const entered = [...game.positions];
    entered[player] = 1;
    return next({ ...base, path: [1], to: 1, again: rules.sixAgain }, entered);
  }

  // Step along, bouncing back from 100 with Exact Roll; without it, any roll that reaches 100 stops there.
  const path: number[] = [];
  let at = from;
  let direction = 1;
  let bounced = false;
  for (let i = 0; i < roll; i++) {
    if (at === SQUARES) {
      if (!rules.exact) break;
      direction = -1;
      bounced = true;
    }
    at += direction;
    path.push(at);
  }
  const jump = jumpAt(at);
  const bitten = rules.bite && jump?.kind === "snake" && jump.jump.from === WORST_SNAKE.from;
  const to = bitten ? 0 : jump ? jump.jump.to : at;
  const won = to === SQUARES;
  const positions = [...game.positions];
  positions[player] = to;
  return next({ ...base, path, jump, to, bounced, bitten, won, again: !won && rules.sixAgain && roll === 6 }, positions);
}
