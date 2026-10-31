import { ARROW_TIPS, COLUMN, current, pathOf, square, taxiOf, victims, type Colour, type Game, type Play } from "@salone/games/ludo/rules";

// A move as a player reads it on their phone (party play), for example "Token 2 · 5 forward · captures Musa".
export function describePlay(game: Game, play: Play, name: (colour: Colour) => string): string {
  const colour = current(game);
  const token = game.tokens[colour][play.token];
  const value = game.dice[play.die];
  const path = pathOf(game, play);
  const landing = path[path.length - 1];
  const parts = [`Token ${play.token + 1}`];
  const taxi = taxiOf(game, { colour, index: play.token });
  if (taxi && taxi.driver.colour === colour) parts.push(`drive the taxi ${path.length} forward`);
  else if (token.where === "yard") parts.push("out of the yard");
  else parts.push(play.back ? `${value} back` : `${value} forward`);
  if (landing?.where === "home") parts.push("home!");
  else if (landing) {
    const caught = taxi ? [] : victims(game, colour, landing);
    if (caught.length) parts.push(`captures ${caught.map((v) => name(v.colour)).join(" and ")}`);
    if (game.rules.poison && landing.where === "track" && ARROW_TIPS.has(square(colour, landing.pos))) parts.push("⚠ poison arrow");
    if (game.rules.hanged && landing.where === "column" && landing.pos === COLUMN - 1) parts.push("⚠ step 55");
  }
  return parts.join(" · ");
}
