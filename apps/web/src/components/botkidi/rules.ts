import { inSquare, type Lid } from "./physics";
import { FACE_DOWN_CHANCE, LINE_Y, SQUARE_CENTER } from "./settings";

// The rules of Botkidi, as Sierra Leonean children played it in the street (Wellbeing SA, Multicultural Children's
// Games):
// 1. Everyone throws their bottle lid from the line at the square chalked against the wall. If more than one lands
//    in the square, those players throw again until only one has.
// 2. That player (the guide's "Player 1"; here the Hitter) uses a stick to hit every other lid as far away as possible.
// 3. The others take turns hitting their own lid back towards the square. Each time one misses, the Hitter hits that
//    lid away again. The round ends when every lid is in the square.
// The guide does not say who wins; here the places go in finishing order: the Hitter first, then each player in the
// order their lid got in. The last one in comes last.
//
// House rule, Flat Side: a lid comes to rest face-up or face-down, and a face-down lid is harder to hit.

export type Phase = "throw" | "whack" | "hit" | "punish" | "done";
export type Rules = { flatSide: boolean };

export type Round = {
  players: number;
  rules: Rules;
  phase: Phase;
  lids: Lid[];
  // Throw-off: the players still in it, and those of them who have thrown this time round.
  contenders: number[];
  thrown: number[];
  hitter: number | null;
  // Who acts now (throws or hits), and whose lid they hit (their own, or another player's for the Hitter).
  current: number;
  target: number;
  // The lids the Hitter still has to hit away at the start (step 2).
  whackQueue: number[];
  // Players whose lid is in the square, in the order it got there (the Hitter is not in this list).
  finished: number[];
};

// What a shot did, for the screen's messages.
export type Outcome =
  | { kind: "threw"; player: number; inSquare: boolean }
  | { kind: "throw-off"; result: "hitter" | "tie" | "none"; players: number[] }
  | { kind: "whacked"; player: number; victim: number }
  | { kind: "hit"; player: number; inSquare: boolean }
  | { kind: "lucky"; player: number };

const offYard = (player: number): Lid => ({ player, x: SQUARE_CENTER.x, y: LINE_Y, vx: 0, vy: 0, face: "up", out: true });

export function newRound(players: number, rules: Rules): Round {
  const all = Array.from({ length: players }, (_, i) => i);
  return { players, rules, phase: "throw", lids: all.map(offYard), contenders: all, thrown: [], hitter: null, current: 0, target: 0, whackQueue: [], finished: [], };
}

// Places for the round once it is done: the Hitter, then everyone in the order their lid got in.
export const places = (round: Round) => (round.hitter === null ? [] : [round.hitter, ...round.finished]);
// Points for a place: last gets 0, each place above it one more.
export const pointsFor = (place: number, players: number) => Math.max(0, players - 1 - place);

// The lid a shot is about to move, placed on the line for a throw.
export function lidToPlay(round: Round, lineX: number): Lid {
  const lid = round.lids[round.target];
  return round.phase === "throw" ? { ...lid, x: lineX, y: LINE_Y, out: false, face: "up" } : lid;
}

// Applies a finished shot: `after` is every lid at rest. `random` decides which way up moved lids land (Flat Side).
export function resolveShot(round: Round, before: Lid[], after: Lid[], random: () => number = Math.random): { round: Round; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  const lids = after.map((lid, i) => {
    const moved = !lid.out && (before[i].out || before[i].x !== lid.x || before[i].y !== lid.y);
    return moved && round.rules.flatSide ? { ...lid, face: random() < FACE_DOWN_CHANCE ? "down" as const : "up" as const } : { ...lid };
  });
  let next: Round = { ...round, lids };

  if (round.phase === "throw") {
    const player = round.current;
    outcomes.push({ kind: "threw", player, inSquare: inSquare(lids[player]) });
    const thrown = [...round.thrown, player];
    const waiting = round.contenders.filter((p) => !thrown.includes(p));
    if (waiting.length) return { round: { ...next, thrown, current: waiting[0], target: waiting[0] }, outcomes };
    const inside = round.contenders.filter((p) => inSquare(lids[p]));
    if (inside.length === 1) {
      const hitter = inside[0];
      outcomes.push({ kind: "throw-off", result: "hitter", players: [hitter] });
      // The Hitter's lid stays in the square, out of play. Every other lid gets hit away, in turn order.
      lids[hitter] = { ...lids[hitter], out: true, x: SQUARE_CENTER.x, y: SQUARE_CENTER.y };
      // A throw can knock a lid that was already out of the throw-off into the square: it is home.
      const finished = lids.filter((l) => !l.out && inSquare(l)).map((l) => l.player);
      for (const p of finished) { lids[p] = { ...lids[p], out: true }; outcomes.push({ kind: "lucky", player: p }); }
      const queue = rotate(round.players, hitter).filter((p) => p !== hitter && !finished.includes(p));
      if (!queue.length) return { round: { ...next, lids, thrown, hitter, finished, phase: "done" }, outcomes };
      return { round: { ...next, lids, thrown, hitter, finished, phase: "whack", whackQueue: queue.slice(1), current: hitter, target: queue[0] }, outcomes };
    }
    // Nobody in, or a tie: those players pick their lids up and throw again.
    const again = inside.length ? inside : round.contenders;
    outcomes.push({ kind: "throw-off", result: inside.length ? "tie" : "none", players: again });
    for (const p of again) lids[p] = offYard(p);
    return { round: { ...next, lids, contenders: again, thrown: [], current: again[0], target: again[0] }, outcomes };
  }

  // Any lid now in the square is home, whoever's shot it was (even one knocked in by accident).
  const finished = [...round.finished];
  for (const lid of lids) {
    if (lid.out || lid.player === round.hitter || finished.includes(lid.player) || !inSquare(lid)) continue;
    finished.push(lid.player);
    lids[lid.player] = { ...lid, out: true };
    if (lid.player !== round.target || round.phase !== "hit") outcomes.push({ kind: "lucky", player: lid.player });
  }
  next = { ...next, lids, finished };
  const hitter = round.hitter!;
  const waiting = (p: number) => p !== hitter && !finished.includes(p);
  const everyoneIn = rotate(round.players, hitter).every((p) => !waiting(p));
  if (everyoneIn) return { round: { ...next, phase: "done" }, outcomes: round.phase === "hit" ? [{ kind: "hit", player: round.current, inSquare: true }, ...outcomes] : outcomes };

  if (round.phase === "whack" || round.phase === "punish") {
    outcomes.unshift({ kind: "whacked", player: hitter, victim: round.target });
    const queue = round.phase === "whack" ? round.whackQueue.filter(waiting) : [];
    if (queue.length) return { round: { ...next, whackQueue: queue.slice(1), current: hitter, target: queue[0] }, outcomes };
    // Everyone's turn to hit their own lid, starting after the Hitter (whack), or after the player who missed.
    const after = round.phase === "whack" ? hitter : round.target;
    const player = nextWaiting(round.players, after, waiting);
    return { round: { ...next, phase: "hit", whackQueue: [], current: player, target: player }, outcomes };
  }

  // phase "hit": the player tried to hit their own lid in.
  const player = round.current;
  const made = finished.includes(player);
  outcomes.unshift({ kind: "hit", player, inSquare: made });
  if (made) {
    const following = nextWaiting(round.players, player, waiting);
    return { round: { ...next, phase: "hit", current: following, target: following }, outcomes };
  }
  // A miss: the Hitter hits that lid away again.
  return { round: { ...next, phase: "punish", current: hitter, target: player }, outcomes };
}

// Every player in turn order, starting after `from`.
function rotate(players: number, from: number) {
  return Array.from({ length: players }, (_, i) => (from + 1 + i) % players);
}

function nextWaiting(players: number, after: number, waiting: (p: number) => boolean) {
  return rotate(players, after).find(waiting) ?? after;
}

// ---- A match: several rounds, with points for each place ----

export type Match = { players: number; rounds: number; played: number; scores: number[] };

export const newMatch = (players: number, rounds: number): Match => ({ players, rounds, played: 0, scores: Array.from({ length: players }, () => 0) });

export function scoreRound(match: Match, round: Round): Match {
  const scores = [...match.scores];
  places(round).forEach((player, place) => { scores[player] += pointsFor(place, match.players); });
  return { ...match, scores, played: match.played + 1 };
}

export const matchOver = (match: Match) => match.played >= match.rounds;
