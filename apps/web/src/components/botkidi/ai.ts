import { cloneLids, hitVelocity, inSquare, settle, type Lid } from "./physics";
import { lidToPlay, type Round } from "./rules";
import { LEVELS, LINE_X, SQUARE_CENTER, type Level } from "./settings";

// The computer player. It tries shots out in the physics model: to get a lid into the square it looks for the
// power that lands it there with room for error either side; as the Hitter it looks for the direction that sends a
// lid furthest from the square. The level then adds a human wobble.

export type Shot = { lineX: number; angle: number; power: number };

const AIM_OFFSETS = [-30, -15, 0, 15, 30];
const POWERS = Array.from({ length: 37 }, (_, i) => 0.1 + i * 0.025);
const AWAY_ANGLES = 24;
const THROW_SPOTS = [300, 360, 420];

// Where the lid ends up after a shot.
export function tryShot(round: Round, shot: Shot): Lid {
  const lids = cloneLids(round.lids);
  const lid = lidToPlay(round, shot.lineX);
  lids[round.target] = { ...lid, ...hitVelocity(lid, shot.angle, shot.power) };
  return settle(lids)[round.target];
}

export function chooseShot(round: Round, level: Level, random: () => number = Math.random): Shot {
  const best = round.phase === "whack" || round.phase === "punish" ? hitAway(round) : getIn(round);
  const { aimError, powerError } = LEVELS[level];
  return {
    lineX: best.lineX,
    angle: best.angle + (random() * 2 - 1) * aimError,
    power: Math.min(1, Math.max(0.08, best.power * (1 + (random() * 2 - 1) * powerError))),
  };
}

// Into the square: for each aim point, the powers that work; the best shot is the one in the middle of the widest
// run of working powers, so a little wobble still lands it.
function getIn(round: Round): Shot {
  const spots = round.phase === "throw" ? THROW_SPOTS : [lidToPlay(round, 0).x];
  let best: Shot | null = null;
  let bestScore = -Infinity;
  for (const lineX of spots) {
    const from = lidToPlay(round, lineX);
    for (const offset of AIM_OFFSETS) {
      const angle = Math.atan2(SQUARE_CENTER.y - from.y, SQUARE_CENTER.x + offset - from.x);
      const results = POWERS.map((power) => tryShot(round, { lineX, angle, power }));
      results.forEach((lid, i) => {
        const run = inSquare(lid) ? 1 + countRun(results, i, -1) + countRun(results, i, 1) : 0;
        const miss = Math.hypot(lid.x - SQUARE_CENTER.x, lid.y - SQUARE_CENTER.y);
        // Landing in the square beats everything; then a wider margin; otherwise get as close as possible.
        const score = run ? 1000 + run * 50 - miss : -miss;
        if (score > bestScore) { bestScore = score; best = { lineX, angle, power: POWERS[i] }; }
      });
    }
  }
  return best ?? { lineX: 360, angle: -Math.PI / 2, power: 0.6 };
}

function countRun(results: Lid[], from: number, dir: number) {
  let n = 0;
  for (let i = from + dir; i >= 0 && i < results.length && inSquare(results[i]); i += dir) n++;
  return Math.min(n, 4);
}

// As far from the square as possible, without knocking it in.
function hitAway(round: Round): Shot {
  let best: Shot = { lineX: 0, angle: Math.PI / 2, power: 1 };
  let bestScore = -Infinity;
  for (let i = 0; i < AWAY_ANGLES; i++) {
    const angle = (i / AWAY_ANGLES) * Math.PI * 2;
    const lid = tryShot(round, { lineX: 0, angle, power: 1 });
    if (inSquare(lid)) continue;
    const score = Math.hypot(lid.x - SQUARE_CENTER.x, lid.y - SQUARE_CENTER.y);
    if (score > bestScore) { bestScore = score; best = { lineX: 0, angle, power: 1 }; }
  }
  return best;
}

export const clampLineX = (x: number) => Math.max(LINE_X.min, Math.min(LINE_X.max, x));
