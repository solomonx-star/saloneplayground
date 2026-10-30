# Salone Playground — Balance Ball

A browser game prototype for Sierra Leonean childhood games. Balance Ball is the current playable game, built with Next.js, TypeScript, and Phaser. Touch remains in the project for a later return.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current Balance Ball prototype

- Three players in the middle dodge a soft sock ball thrown from the sides.
- Select a middle player and move with WASD, arrow keys, or the mobile movement pad; teammates dodge on their own.
- The computer throws while you are in the middle. When you are throwing, tap/click the field to aim and throw.
- A hit swaps teams for the next turn.
- The game shelf opens Balance Ball in a fullscreen play view on desktop and adapts to mobile screens.

The field is loaded only in the browser. Next.js owns the site interface and Phaser owns the game canvas and play loop.
