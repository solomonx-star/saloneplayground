// Rules and computer player for Ludo, played with two dice and a set of house rules that can be switched on
// and off. Pure functions so they can be tested.

export type Colour = "red" | "green" | "yellow" | "blue";
export type Level = "easy" | "normal" | "hard";
export type Rule = "doubles" | "poison" | "backFront" | "hanged" | "timer" | "taxi";
export type Rules = Record<Rule, boolean>;
// Where a token is: in its yard, on the shared track (pos = squares from its own start, 0–51; below 0 when Back &
// Front has taken it back past its start, so it has the whole lap still to run), in its own home column (pos 0–4),
// or home.
export type Token = { where: "yard" | "track" | "column" | "home"; pos: number };
export type Ref = { colour: Colour; index: number };
// A move: which of the player's tokens, which of the dice still to play (an index into `dice`), and whether it
// goes backward (Back & Front).
export type Play = { token: number; die: number; back?: boolean };
// Taxi: a captured token (the driver) carrying the token that caught it (the rider) to the rider's home entrance.
export type Taxi = { driver: Ref; rider: Ref };
export type Game = {
  rules: Rules;
  seats: Colour[];
  tokens: Record<Colour, Token[]>;
  // Index into seats of whose turn it is.
  turn: number;
  // The dice rolled and not yet played; empty means the player is about to roll.
  dice: number[];
  // Whether this roll has earned another one: a double, a capture or a token reaching home.
  bonus: boolean;
  taxis: Taxi[];
  winner: Colour | null;
};

// Turn order, clockwise round the board: Players 1 to 4.
export const COLOURS: Colour[] = ["red", "green", "blue", "yellow"];
export const TOKENS = 4;
export const TRACK = 52;
// The last track square before a token turns up its home column (its home entrance), and the squares in that
// column.
export const LAST = 50;
export const COLUMN = 5;
// Each colour's start square on the shared track. The four start squares (drawn in their colour) are safe.
export const START: Record<Colour, number> = { red: 0, green: 13, blue: 26, yellow: 39 };
export const SAFE = new Set(Object.values(START));
// The track squares the board's arrows point to: the arrow along each start lane (3 squares on) and the arrow
// round each inner corner (5 squares on). Poison Arrow sends any token landing on one back to its yard.
export const ARROW_TIPS = new Set(Object.values(START).flatMap((s) => [s + 3, s + 5]));
export const TURN_SECONDS = 30;

export const RULES: Record<Rule, { label: string; blurb: string }> = {
  doubles: { label: "Double Number Repeat", blurb: "Any double earns another roll, not only a double 6." },
  poison: { label: "Poison Arrow", blurb: "Landing on a square an arrow points to sends your token back to its yard." },
  backFront: { label: "Back & Front", blurb: "A token may move backward by a die when that lands on another colour's token and captures it." },
  hanged: { label: "Hanged Rule", blurb: "Landing on step 55, the last square before home, hangs your token: it goes back to its yard." },
  timer: { label: "Turn Timer", blurb: `${TURN_SECONDS} seconds for each roll or move, or the game plays it for you.` },
  taxi: { label: "Taxi", blurb: "A captured token becomes a taxi: it carries the token that caught it to that colour's home entrance, and every die its owner rolls must move the taxi until then." },
};
export const NO_RULES: Rules = { doubles: false, poison: false, backFront: false, hanged: false, timer: false, taxi: false };

// noise: how much randomness is added to the computer's move scores, so easier levels slip up.
export const LEVELS: Record<Level, { label: string; noise: number }> = {
  easy: { label: "Easy", noise: 80 },
  normal: { label: "Normal", noise: 18 },
  hard: { label: "Hard", noise: 0 },
};

export const square = (colour: Colour, pos: number) => (((START[colour] + pos) % TRACK) + TRACK) % TRACK;
export const current = (game: Game) => game.seats[game.turn];
export const finished = (game: Game, colour: Colour) => game.tokens[colour].length > 0 && game.tokens[colour].every((t) => t.where === "home");
const same = (a: Ref, b: Ref) => a.colour === b.colour && a.index === b.index;
export const taxiOf = (game: Game, token: Ref) => game.taxis.find((t) => same(t.driver, token) || same(t.rider, token));

// Two players sit opposite each other: Players 1 and 3.
export function seatsFor(players: number): Colour[] {
  return players >= 4 ? COLOURS.slice() : players === 3 ? ["red", "green", "blue"] : ["red", "blue"];
}

export function newGame(players: number, rules: Rules = NO_RULES): Game {
  const seats = seatsFor(players);
  const tokens = Object.fromEntries(COLOURS.map((c) => [c, Array.from({ length: seats.includes(c) ? TOKENS : 0 }, (): Token => ({ where: "yard", pos: 0 }))])) as Record<Colour, Token[]>;
  return { rules, seats, tokens, turn: 0, dice: [], bonus: false, taxis: [], winner: null };
}

// ---- Moving ----

// Steps a token `roll` squares forward, one at a time. Returns every place it passes through (the last is where
// it lands), or null when the move is not allowed: a token in the yard needs a 6, and a token must land exactly home.
export function walk(token: Token, roll: number): Token[] | null {
  if (token.where === "home") return null;
  if (token.where === "yard") return roll === 6 ? [{ where: "track", pos: 0 }] : null;
  const steps: Token[] = [];
  let t = token;
  for (let i = 0; i < roll; i++) {
    if (t.where === "home") return null;
    if (t.where === "track") t = t.pos === LAST ? { where: "column", pos: 0 } : { where: "track", pos: t.pos + 1 };
    else t = t.pos === COLUMN - 1 ? { where: "home", pos: 0 } : { where: "column", pos: t.pos + 1 };
    steps.push(t);
  }
  return steps;
}

// Back & Front: steps a token on the track backward. It may go back past its own start square, but then it has the
// whole lap to run again before it can turn up its home column.
export function walkBack(token: Token, roll: number): Token[] | null {
  if (token.where !== "track") return null;
  return Array.from({ length: roll }, (_, i): Token => ({ where: "track", pos: token.pos - i - 1 }));
}

// Tokens of other colours that a token landing on `landing` would capture. Start and star squares are safe, and
// tokens in a taxi are out of play.
export function victims(game: Game, colour: Colour, landing: Token): Ref[] {
  if (landing.where !== "track") return [];
  const at = square(colour, landing.pos);
  if (SAFE.has(at)) return [];
  return game.seats.flatMap((c) => (c === colour ? [] : game.tokens[c].flatMap((t, index) => (t.where === "track" && square(c, t.pos) === at && !taxiOf(game, { colour: c, index }) ? [{ colour: c, index }] : []))));
}

// Every move the player can make with the dice still to play. Doubles count once. While one of the player's
// tokens is a taxi, every die must move the taxi.
export function plays(game: Game): Play[] {
  if (game.winner) return [];
  const colour = current(game);
  const dice = game.dice.flatMap((value, die) => (game.dice.indexOf(value) === die ? [die] : []));
  const taxi = game.taxis.find((t) => t.driver.colour === colour);
  if (taxi) return dice.map((die) => ({ token: taxi.driver.index, die }));
  return dice.flatMap((die) => game.tokens[colour].flatMap((t, token): Play[] => {
    if (taxiOf(game, { colour, index: token })) return [];
    const out: Play[] = walk(t, game.dice[die]) ? [{ token, die }] : [];
    const back = game.rules.backFront ? walkBack(t, game.dice[die]) : null;
    if (back && victims(game, colour, back[back.length - 1]).length) out.push({ token, die, back: true });
    return out;
  }));
}

// The token states a move passes through, for drawing it.
export function pathOf(game: Game, play: Play): Token[] {
  const colour = current(game);
  const token = game.tokens[colour][play.token];
  const value = game.dice[play.die];
  const taxi = game.taxis.find((t) => t.driver.colour === colour && t.driver.index === play.token);
  if (taxi) {
    const rider = game.tokens[taxi.rider.colour][taxi.rider.index];
    const steps = Math.min(value, LAST - rider.pos);
    return Array.from({ length: steps }, (_, i): Token => ({ where: "track", pos: (token.pos + i + 1) % TRACK }));
  }
  return (play.back ? walkBack(token, value) : walk(token, value)) ?? [];
}

// What happened on a move, for the screen to report.
export type Outcome = { captured: Ref[]; taxi: boolean; dropped: boolean; poisoned: boolean; hanged: boolean; home: boolean };

// Hands the turn on.
export function passTurn(game: Game): Game {
  return { ...game, turn: (game.turn + 1) % game.seats.length, dice: [], bonus: false };
}

// Records a roll of the two dice. A double 6 earns another roll once these are played; with Double Number
// Repeat, any double does.
export function rolled(game: Game, a: number, b: number): Game {
  return { ...game, dice: [a, b], bonus: a === b && (a === 6 || game.rules.doubles) };
}

// Ends the roll once nothing more can be played: the same player rolls again if they earned it, otherwise the
// turn passes. Dice that cannot be used are lost.
export function skip(game: Game): Game {
  return game.bonus ? { ...game, dice: [], bonus: false } : passTurn(game);
}

// Makes a move and reports what happened. See `move` for the rules.
export function play(game: Game, chosen: Play): { game: Game; outcome: Outcome } {
  const outcome: Outcome = { captured: [], taxi: false, dropped: false, poisoned: false, hanged: false, home: false };
  const colour = current(game);
  const path = pathOf(game, chosen);
  if (!plays(game).some((p) => p.token === chosen.token && p.die === chosen.die && !!p.back === !!chosen.back)) return { game, outcome };
  const tokens = Object.fromEntries(COLOURS.map((c) => [c, game.tokens[c].slice()])) as Record<Colour, Token[]>;
  let taxis = game.taxis;
  let bonus = game.bonus;
  const taxi = taxis.find((t) => t.driver.colour === colour && t.driver.index === chosen.token);
  if (taxi) {
    // The taxi carries its rider on towards the rider's home entrance, and drops it off there.
    const rider = tokens[taxi.rider.colour][taxi.rider.index];
    const riderPos = rider.pos + path.length;
    tokens[taxi.rider.colour][taxi.rider.index] = { where: "track", pos: riderPos };
    tokens[colour][chosen.token] = path.length ? path[path.length - 1] : tokens[colour][chosen.token];
    if (riderPos >= LAST) {
      tokens[colour][chosen.token] = { where: "yard", pos: 0 };
      taxis = taxis.filter((t) => t !== taxi);
      outcome.dropped = true;
    }
  } else {
    const landing = path[path.length - 1];
    const poisoned = game.rules.poison && landing.where === "track" && ARROW_TIPS.has(square(colour, landing.pos));
    const hanged = game.rules.hanged && landing.where === "column" && landing.pos === COLUMN - 1;
    if (poisoned || hanged) {
      tokens[colour][chosen.token] = { where: "yard", pos: 0 };
      outcome.poisoned = poisoned; outcome.hanged = hanged;
    } else {
      tokens[colour][chosen.token] = landing;
      const hit = victims(game, colour, landing);
      outcome.captured = hit;
      outcome.home = landing.where === "home";
      // With Taxi, the first token caught carries the catcher, unless the catcher is already at its home entrance.
      const carry = game.rules.taxi && hit.length && landing.pos < LAST ? hit[0] : null;
      for (const v of hit) if (v !== carry) tokens[v.colour][v.index] = { where: "yard", pos: 0 };
      if (carry) { taxis = [...taxis, { driver: carry, rider: { colour, index: chosen.token } }]; outcome.taxi = true; }
      bonus = bonus || hit.length > 0 || outcome.home;
    }
  }
  const dice = game.dice.filter((_, i) => i !== chosen.die);
  const next: Game = { ...game, tokens, taxis, dice, bonus };
  if (finished(next, colour)) return { game: { ...next, winner: colour, dice: [] }, outcome };
  return { game: plays(next).length ? next : skip(next), outcome };
}

// Moves a token by one of the dice. Captured tokens go back to their yard (or, with Taxi, the first carries the
// catcher). A capture or a token reaching home earns another roll. When no die is left that can be played, the
// roll ends.
export const move = (game: Game, chosen: Play) => play(game, chosen).game;

// ---- Computer player ----

// How far along a token is, from -1 in the yard to 56 home.
export const progress = (t: Token) => (t.where === "yard" ? -1 : t.where === "track" ? t.pos : t.where === "column" ? LAST + 1 + t.pos : LAST + 1 + COLUMN);

// How many tokens of other colours could land on track square `at` with one die (from behind, or with Back &
// Front from in front too).
export function threats(game: Game, colour: Colour, at: number): number {
  if (SAFE.has(at)) return 0;
  let count = 0;
  for (const c of game.seats) {
    if (c === colour) continue;
    for (const [index, t] of game.tokens[c].entries()) {
      if (t.where !== "track" || taxiOf(game, { colour: c, index })) continue;
      const behind = (at - square(c, t.pos) + TRACK) % TRACK;
      // A token about to turn up its home column cannot reach squares beyond its turn.
      if (behind >= 1 && behind <= 6 && t.pos + behind <= LAST) count++;
      else if (game.rules.backFront && behind >= TRACK - 6) count++;
    }
  }
  return count;
}

// How good a move is: captures, getting home, getting out of the yard and out of danger count for it; landing
// where others can hit you, on a poison arrow or on the hanging square counts against.
export function scoreMove(game: Game, chosen: Play): number {
  const colour = current(game);
  const token = game.tokens[colour][chosen.token];
  if (taxiOf(game, { colour, index: chosen.token })) return 0;
  const path = pathOf(game, chosen);
  if (!path.length) return -Infinity;
  const landing = path[path.length - 1];
  if (game.rules.hanged && landing.where === "column" && landing.pos === COLUMN - 1) return -80 - progress(token);
  if (game.rules.poison && landing.where === "track" && ARROW_TIPS.has(square(colour, landing.pos))) return -60 - progress(token);
  let score = (progress(landing) - progress(token)) * 0.6;
  if (landing.where === "home") score += 60;
  if (token.where === "yard") score += 40;
  for (const v of victims(game, colour, landing)) score += 55 + progress(game.tokens[v.colour][v.index]) * 0.6 + (game.rules.taxi ? 10 : 0);
  if (token.where === "track") score += threats(game, colour, square(colour, token.pos)) * (10 + token.pos * 0.5);
  if (landing.where === "track") {
    score -= threats(game, colour, square(colour, landing.pos)) * ((game.rules.taxi ? 16 : 12) + landing.pos * 0.5);
    if (SAFE.has(square(colour, landing.pos))) score += 8;
  }
  if (landing.where === "column" && token.where === "track") score += 18;
  return score;
}

// The computer's next move, looking one move ahead so it plays its two dice in the best order.
export function chooseMove(game: Game, level: Level, random: () => number = Math.random): Play | null {
  const options = plays(game);
  if (!options.length) return null;
  const { noise } = LEVELS[level];
  let best = options[0]; let bestScore = -Infinity;
  for (const option of options) {
    let score = scoreMove(game, option);
    const after = move(game, option);
    // Only look ahead while it is still the same roll (the second die is still to play).
    if (after.dice.length && after.turn === game.turn && !after.winner) {
      const follow = plays(after).map((p) => scoreMove(after, p));
      if (follow.length) score += Math.max(...follow) * 0.9;
    }
    score += random() * noise;
    if (score > bestScore) { bestScore = score; best = option; }
  }
  return best;
}
