# Salone Playground

A browser game prototype for Sierra Leonean childhood games, built with Next.js, TypeScript, and Phaser. Two games are playable: Balance Ball and Touch.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current Balance Ball prototype

- A team of three takes turns in the middle, one player at a time, dodging a soft sock ball thrown from the sides. The others wait on the bench.
- Move the player in the middle with WASD, arrow keys, or the mobile movement pad.
- The computer throws while you are in the middle. When you are throwing, tap/click the field to aim; the thrower nearest your tap throws.
- A hit puts that player out and the next one steps in. When all three are out, the teams swap.
- The game shelf opens Balance Ball in a fullscreen play view on desktop and adapts to mobile screens.

## Touch

- Attackers run up through four defended lines to the turn-back line, then try to make it home without being touched. Defenders can only move along their own line; the Main Line defender patrols the centre line.
- A match is 3 attacking turns per team. Each defended line crossed scores 1 and a safe return home scores 5. The attacking team keeps going until one of its players is touched; then the sides swap. Most points wins.
- Choose Easy, Normal, or Hard. The level sets the opposing team; your own computer teammates always play at Normal. Changing the level or team size starts a new match.
- Controls: WASD or arrow keys to move, Shift to sprint (uses stamina), Space to switch player, or tap a player. Touch screens get a joystick plus SPRINT and SWITCH buttons.
- A how-to-play overlay shows on first visit and from the `?` button. Sound effects are synthesized in the browser (no audio files) and can be muted.
- Computer defenders show what they are about to do: an orange marker for where they are guarding, LUNGE when they go for a runner, FAKE when they open a gap as bait.

### Code layout (`src/components/touch/`)

| File | Purpose |
| --- | --- |
| `settings.ts` | All balance numbers: speeds, levels, sprint, scoring, field width, turns per team |
| `field.ts` | Field layout constants and geometry helpers |
| `attackers.ts` | Computer attacker decisions (when and where to cross) |
| `defenders.ts` | Computer defender decisions (guard, lunge, bait, Main Line patrol) |
| `scene.ts` | Phaser scene: match flow, input, scoring, effects and drawing |
| `sound.ts` | Synthesized sound effects |
| `TouchGame.tsx`, `HowToPlay.tsx` | React screen, controls and overlays |
| `ai.test.ts` | Tests for the attacker and defender decisions |

## Tests

```bash
npm test
```

The field is loaded only in the browser. Next.js owns the site interface and Phaser owns the game canvas and play loop.
