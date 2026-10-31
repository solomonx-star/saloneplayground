# Salone Playground

A browser game prototype for Sierra Leonean childhood games, built with Next.js, TypeScript, and Phaser. Balance Ball, Touch, Hide and Seek, Draft, Marbles, Tin Tan To, and Ludo are playable.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Balance Ball

- One sock ball, two throwing ends. A throw has to reach the other end (bouncing off the side lines if it is angled) and be picked up there before anyone can throw again.
- A team of three dodges one player at a time; when all three are out the teams swap. A match is one inning each; most points wins.
- Four modes:
  - **Classic**: dodge in the middle. Every throw at you that reaches the far end without a hit scores a point for the dodging team.
  - **Round of 24**: five circles, one in the middle where the run starts and ends and four out towards the corners of the dodge zone, numbered 1–4 and spaced well apart so every run is a long dash in the open. Run 1 → 2 → 3 → 4 and round again; each circle reached in order is a round, and four rounds make a lap (six laps in all). After round 23 you run back to the middle for round 24, the home stretch. You are safe only in your base, the circle you last reached in order, and only until its ring runs out (8, 6 or 5 seconds on Easy, Normal or Hard, 0.4 seconds less each lap, never under 3). The clock keeps running if you step out, so stepping back in does not restart it, and circles you have already run give no shelter. Each round run scores a point; making it home scores 5 more. A strip on the scoreboard shows the 24 rounds.
  - **Gather**: bottle caps are scattered all over the dodge zone (10, 12 or 15 on Easy, Normal or Hard). Pick them up one at a time (carrying one slows you a little) and bring each to the small circle in the middle. There is nowhere safe. Each cap brought in scores a point; bringing in every cap scores 5 more and the next player gets a fresh field. A cap being carried is lost if you are hit.
  - **All Man Yone**: both teams are in the field together, three a side, and the throwers at the ends are neutral. Anyone the ball touches is out. You play the gold-ringed player; if you are hit you take over a teammate who is still in. A round ends when one team has no one left standing, and that team loses it. First team to win 2 rounds wins the match. The throwers pick someone close to them who is still in, so neither team is singled out.
- Computer throwers move: the thrower with the ball steps up and squares up to the dodger, the other spreads out for a second angle and runs to meet the ball. They throw fast, usually aim ahead of a runner, hold the ball while you are safe in a circle (passing it across for a new angle), and need a moment to react when you break from a circle. A ring around a computer thrower shows it winding up.
- Computer dodgers sidestep throws they see coming; in Round of 24 they wait in a circle until the ball is far enough away to make the run.
- Choose Easy, Normal, or Hard. The level sets the computer team: how fast it throws and moves, how long its throwers wind up and react, how well they aim and lead, how fast its dodger runs and how often it sees a throw coming. Your own team always plays at the normal pace. In Round of 24 the computer throwers get sharper every lap. Changing the level starts a new match.
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

## Tin Tan To

- The local three-in-a-row game, played on a board drawn on paper: nine points joined by the outer rectangle, the middle row and column, and the two long diagonals through the centre.
- Each side has three pieces, starting on its own home row (yours at the bottom, the other side's at the top). Take turns sliding one piece along a line to the next empty point; there is no jumping or capturing.
- Three in a row along any line wins, except along your own home row. The other side's home row does count.
- A round is a draw if the same position comes round three times, or after 60 moves with no winner. (A side can never be left with no move unless the other side already has a line.)
- Play against the computer or two players on one device. The score is kept across rounds, and who moves first swaps every round.
- Levels: Easy sometimes misses a win and can walk into a loss; Normal always takes a win and never hands one over with a careless move, but still makes mistakes; Hard plays the solved game (every position is worked out in advance) and can only be held to a draw. With best play the game is a draw; opening by moving a corner piece into the centre loses.
- Tap a piece to pick it up, then tap a lit point to slide it there. Number keys 1–9 tap the points (laid out like a phone keypad, 1 is top left); Escape puts a piece down.
- Code: rules, solver and computer player in `src/components/tintanto/rules.ts`, tests in `tintanto/tintanto.test.ts`, screen in `TinTanToGame.tsx`.

## Ludo

- A 15×15 board drawn like a printed one: Player 1 red (top left), Player 2 green (top right), Player 3 blue (bottom right) and Player 4 yellow (bottom left), with black grid lines, a pale centre and black arrows (into each home column, along each start lane and round each inner corner). A shared track of 52 squares, a home column for each colour and the centre. Play goes clockwise, Player 1 to 4. Four tokens each; the first to get all four home wins.
- Played with two dice, which tumble in the middle of the board. Each die is played separately: both on one token, or one on each. A 6 on either die brings a token out onto its start square (using that 6). Tokens go round the board, up their home column and must land home exactly. A die that cannot be used is lost.
- Landing on another colour's token sends it back to its yard. The four start squares (drawn in their colour) are safe. A double 6, a capture or getting a token home earns another roll.
- House rules, switched on and off below the board (any mix; changing them starts a new game):
  1. **Double Number Repeat**: any double earns another roll, not only a double 6.
  2. **Poison Arrow**: landing on a track square an arrow points to (the eight squares at the tips of the start-lane and corner arrows, tinted red while the rule is on) sends any token back to its yard.
  3. **Back & Front**: a token may move backward by a die, but only when that lands on another colour's token and captures it. It may go back past its own start square, but then has the whole lap to run again. Tokens on the coloured start squares are safe from backward captures too. A token that can capture backward (with either die) gets a red ring; tapping it does not move it but shows its lines of play: a red line to each backward capture and a green line for each forward move, each ending in a marker with its die. Tap the end of the line you want (tap the token again to put it down).
  4. **Hanged Rule**: step 55 (55 squares on from the start square: the last square before home, marked 55) hangs a token that lands on it, sending it back to its yard. Passing over it to land home exactly is fine.
  5. **Turn Timer**: 30 seconds for each roll or move; when it runs out the game plays it for you (at Normal level).
  6. **Taxi**: a captured token does not go home; it becomes a taxi carrying the token that caught it (its master), drawn riding on top. Every die the taxi's owner rolls must move the taxi until the master reaches the entrance of its own home column; there the master gets off and the taxi goes back to its yard. Tokens in a taxi cannot be captured.
- 2, 3 or 4 players (two players sit opposite each other: Players 1 and 3). Play against the computer (you are red) or pass and play on one device.
- Levels: the computer scores each move (captures, getting home, getting out, staying out of reach, avoiding poison arrows and the hanging square) and looks one move ahead to play its two dice in the best order; Easy and Normal add randomness to those scores. It is still a dice game, so no level wins every time.
- Tap the dice in the middle of the board or ROLL DICE (or press Space) to roll. Tokens glow for the die in use; when the two dice can move different tokens, tap a die to switch (or press D), then tap a glowing token (or press 1–4). With only one possible move it is made for you; with none, the roll ends.
- Code: rules, house rules and computer player in `src/components/ludo/rules.ts`, board layout in `ludo/board.ts`, tests in `ludo/ludo.test.ts`, screen in `LudoGame.tsx`.

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
