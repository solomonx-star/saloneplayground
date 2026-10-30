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
- A match is 3 attacking turns per team. Each safe return home scores 1, and the attacking team keeps going until one of its players is touched; then the sides swap.
- Choose Easy, Normal, or Hard. The level sets the opposing team; your own computer teammates always play at Normal. Changing the level or team size starts a new match.
- Tap a player to control them. Move with WASD, arrow keys, or the on-screen joystick on touch devices.
- All balance numbers (speeds, levels, field width, turns per team) live in `src/components/touchSettings.ts`.

The field is loaded only in the browser. Next.js owns the site interface and Phaser owns the game canvas and play loop.
