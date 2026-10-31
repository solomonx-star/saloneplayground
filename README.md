# Salone Playground

A browser game prototype for Sierra Leonean childhood games, built with Next.js, TypeScript, and Phaser. Balance Ball, Touch, Hide and Seek, Draft, Marbles, and Tic Tac To are playable.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Balance Ball

- One sock ball, two throwing ends. A throw has to reach the other end (bouncing off the side lines if it is angled) and be picked up there before anyone can throw again.
- A team of three dodges one player at a time; when all three are out the teams swap. A match is one inning each; most points wins.
- Two modes:
  - **Classic**: dodge in the middle. Every throw at you that reaches the far end without a hit scores a point for the dodging team.
  - **Round of 24**: five circles, one in the middle where the run starts and ends and four on the diagonals numbered 1–4. Run 1 → 2 → 3 → 4 and round again; each circle reached in order is a round. After round 23 you run back to the middle for round 24. You are safe inside a circle and can be hit anywhere else. A circle only keeps you safe for 6 seconds (a ring counts it down), so you have to keep moving. Each round run scores a point.
- Computer throwers move: the thrower with the ball steps up and squares up to the dodger, the other spreads out for a second angle and runs to meet the ball. They throw fast, usually aim ahead of a runner, hold the ball while you are safe in a circle (passing it across for a new angle), and need a moment to react when you break from a circle. A ring around a computer thrower shows it winding up.
- Computer dodgers sidestep throws they see coming; in Round of 24 they wait in a circle until the ball is far enough away to make the run.
- Controls: WASD, arrow keys or the joystick move your dodger, or your thrower with the ball when your team is throwing. Click or tap the field to throw, or press Space to throw at the dodger.
- Code: tuning in `src/components/balance/settings.ts`, ball and decision logic in `balance/logic.ts` (tested in `balance/balance.test.ts`), Phaser scene in `balance/scene.ts`, screen in `balance/BalanceGame.tsx`.

## Touch

- Attackers run up through four defended lines to the turn-back line, then try to make it home without being touched. Defenders can only move along their own line; the Main Line defender patrols the centre line.
- A match is 3 attacking turns per team. Each defended line crossed scores 1 and a safe return home scores 5. The attacking team keeps going until one of its players is touched; then the sides swap. Most points wins.
- Choose Easy, Normal, or Hard. The level sets the opposing team; your own computer teammates always play at Normal. Changing the level or team size starts a new match.
- Controls: WASD or arrow keys to move, Shift to sprint (uses stamina), Space to switch player, or tap a player. Touch screens get a joystick plus SPRINT and SWITCH buttons.
- A how-to-play overlay shows on first visit and from the `?` button. Sound effects are synthesized in the browser (no audio files) and can be muted.
- Computer defenders show what they are about to do: an orange marker for where they are guarding, LUNGE when they go for a runner, FAKE when they open a gap as bait.

## Hide and Seek (Play Kech)

- You are the seeker. Count at HOME with your eyes closed (the yard goes dark) while five hiders run to the bushes, crates and long grass.
- Hiders are invisible once hidden. Rustling spots and falling leaves give them away, more often as you get close; on Normal and Hard, empty spots also rustle in the wind as decoys.
- Get within reach of a hiding spot to spot whoever is inside: they bolt for HOME and you must touch them before they get there. Hiders also sneak home on their own when you wander too far from HOME to win the race.
- Catch everyone before the timer runs out (Easy 90 s, Normal 75 s, Hard 60 s). Anyone still hidden at time up counts as safe. Your best score per level is remembered on this device.
- Controls: WASD or arrow keys, Shift to sprint (uses stamina). Touch screens get the joystick and a SPRINT button.
- Code: tuning in `src/components/seek/settings.ts`, hider decisions in `seek/hiders.ts` (tested in `seek/seek.test.ts`), Phaser scene in `seek/scene.ts`, screen in `HideSeekGame.tsx`.

## Marbles (ring game)

- Thirteen marbles start in a cross in the middle of a ring scratched into the dirt. Knock them out of the ring to keep them; most marbles wins (the match ends as soon as one side cannot be caught).
- Drag your shooter around the ring line to choose where to shoot from, then pull back from it and let go to flick. The further you pull, the harder the shot (power bar under the shooter).
- Knock a marble out and you shoot again, from where your shooter stopped if it is still inside the ring. Miss and the turn passes.
- Play against the computer (Easy, Normal, Hard) or pass the phone between two players.
- The ground is rough on purpose: a full-power shot rolls about two-thirds of the way across, so marbles are chipped out rather than blasted. In self-play the computer clears about 1, 2 and 3 marbles a turn on Easy, Normal and Hard.
- Code: tuning in `src/components/marbles/settings.ts`, physics in `marbles/physics.ts`, rules in `marbles/rules.ts`, the computer player (which tries shots out in the physics before taking one) in `marbles/ai.ts`, tests in `marbles/marbles.test.ts`, scene in `marbles/scene.ts`, screen in `MarblesGame.tsx`.

## Tic Tac To

- Classic 3×3: take turns marking squares and get three in a row. Chalk marks are drawn on a slate board and the winning line is chalked through.
- Play against the computer or two players on one device. The score is kept across rounds (wins and draws), and who goes first swaps every round.
- Levels: Easy sometimes misses wins and blocks; Normal always takes a win or blocks but still makes mistakes; Hard plays perfectly (full minimax) and can only be held to a draw.
- Tap or click a square, or use the number keys 1–9 (laid out like a phone keypad, 1 is top left).
- Code: rules and computer player in `src/components/tictacto/rules.ts`, tests in `tictacto/tictacto.test.ts`, screen in `TicTacToGame.tsx`.

## Draft

- 10×10 African checkers board with 20 pieces per side; you play Black and move first.
- Capturing is optional, as it is played locally: leaving a piece en prise is how players set traps. A capture chain uses one piece and may stop after any jump (STOP HERE). Men move forward and capture in either direction; kings fly along open diagonals.
- The stricter rule (captures compulsory, chains run to the end) is still available in `legalTurns` via `forceCapture`.
- Captured pieces come off at the end of the turn, so a piece cannot be jumped twice. A man is crowned only if its turn ends on the far row.
- 25 king moves each without a capture is a draw.
- The computer searches ahead with minimax (Easy 1 turn with mistakes, Normal 3 turns, Hard 4 turns). It may decline a capture that walks into a trap. The level can be changed mid-game.
- Suggestions, not orders: pieces that can capture glow, HINT marks a recommended move (which may be to decline a capture), the last move is highlighted, and UNDO takes back your last turn or cancels an unfinished chain.
- Code: rules in `src/components/draft/rules.ts`, computer player in `draft/ai.ts`, tests in `draft/draft.test.ts`, screen in `DraftGame.tsx`.

### Code layout (`src/components/touch/`)

| File | Purpose |
| --- | --- |
| `settings.ts` | All balance numbers: speeds, levels, sprint, scoring, field width, turns per team |
| `field.ts` | Field layout constants and geometry helpers |
| `attackers.ts` | Computer attacker decisions (when and where to cross) |
| `defenders.ts` | Computer defender decisions (guard, lunge, bait, Main Line patrol) |
| `scene.ts` | Phaser scene: match flow, input, scoring, effects and drawing |
| `TouchGame.tsx`, `HowToPlay.tsx` | React screen, controls and overlays |
| `ai.test.ts` | Tests for the attacker and defender decisions |

## Tests

```bash
npm test
```

The field is loaded only in the browser. Next.js owns the site interface and Phaser owns the game canvas and play loop.
