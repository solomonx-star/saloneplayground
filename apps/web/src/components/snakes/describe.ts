import type { SnakesEvent } from "@salone/games/snakes/match";
import { SQUARES } from "@salone/games/snakes/board";

// What a player reads about a roll that just happened. `name` gives each player's name ("You" for this player).
export function describe(event: SnakesEvent, name: (player: number) => string): string {
  if (event.kind === "stood-in") {
    const who = name(event.player);
    return who === "You" ? "You were away — the game rolled for you." : `${who} is away — the game rolled for them.`;
  }
  const { move } = event;
  const who = name(move.player);
  const you = who === "You";
  const again = move.again ? " Another roll!" : "";
  const rolled = `${who} rolled ${move.roll === 6 || move.roll === 1 ? `a ${move.roll}` : move.roll}`;
  if (move.threeSixes) return `${who} rolled a third 6 in a row — the turn is over, no move.`;
  if (move.waiting) return `${rolled} — ${you ? "you need" : "needs"} a 6 to start.`;
  if (move.won) return `${rolled} and reached ${SQUARES}! ${you ? "You win!" : `${who} wins!`}`;
  if (move.from === 0 && move.roll === 6 && move.to === 1 && move.path.length === 1) return `${rolled} and ${you ? "are" : "is"} on the board, on square 1.${again}`;
  const bounce = move.bounced ? `, went past ${SQUARES} and bounced back` : "";
  if (move.bitten && move.jump) return `${rolled}${bounce} and was bitten by the ${move.jump.jump.name.toLowerCase()} on ${move.jump.jump.from} — right back to the start!${again}`;
  if (move.jump?.kind === "snake") return `${rolled}${bounce} and slid down the ${move.jump.jump.name.toLowerCase()} from ${move.jump.jump.from} to ${move.to}.${again}`;
  if (move.jump?.kind === "ladder") {
    const { name: ladder, from } = move.jump.jump;
    const how = ladder === "Bamboo ladder" ? "climbed a bamboo ladder" : `climbed ${ladder.replace(/^Up /, "up ")}`;
    return `${rolled} and ${how} from ${from} to ${move.to}!${again}`;
  }
  if (move.bounced) return `${rolled}, went past ${SQUARES} and bounced back to ${move.to}.${again}`;
  return `${rolled} and moved to ${move.to}.${again}`;
}
