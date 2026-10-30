# Salone Playground

A browser game prototype for Sierra Leonean childhood games, built with Next.js, TypeScript, and Phaser. Balance Ball, Touch, Hide and Seek, and Draft are playable.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current Balance Ball prototype

- A team of three takes turns in the middle, one player at a time, dodging a soft sock ball thrown from the sides. The others wait on the bench.
- Move the player in the middle with WASD, arrow keys, or the joystick on touch screens (a partial push moves slower).
- The computer throws while you are in the middle. When you are throwing, tap/click the field to aim; the thrower nearest your tap throws.
- A hit puts that player out and the next one steps in. When all three are out, the teams swap.
- Feedback: throws whoosh and the thrower pops, balls cast a shadow, a hit shakes the screen and plays in slow motion, close dodges are called out, and a full knockout gets a cheer. While throwing, a faint guide shows the aim from the nearest thrower.
- Sound and the mute button are shared with Touch (`src/components/sound.ts`); visual effects are in `src/components/effects.ts`.
- The game shelf opens Balance Ball in a fullscreen play view on desktop and adapts to mobile screens.

## Touch

- Attackers run up through four defended lines to the turn-back line, then try to make it home without being touched. Defenders can only move along their own line; the Main Line defender patrols the centre line.
- A match is 3 attacking turns per team. Each defended line crossed scores 1 and a safe return home scores 5. The attacking team keeps going until one of its players is touched; then the sides swap. Most points wins.
- Choose Easy, Normal, or Hard. The level sets the opposing team; your own computer teammates always play at Normal. Changing the level or team size starts a new match.
- Controls: WASD or arrow keys to move, Shift to sprint (uses stamina), Space to switch player, or tap a player. Touch screens get a joystick plus SPRINT and SWITCH buttons.
- A how-to-play overlay shows on first visit and from the `?` button. Sound effects are synthesized in the browser (no audio files) and can be muted.
- Computer defenders show what they are about to do: an orange marker for where they are guarding, LUNGE when they go for a runner, FAKE when they open a gap as bait.

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
