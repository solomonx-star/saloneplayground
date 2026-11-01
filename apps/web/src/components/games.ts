// The playable games on the shelf. Each one has its own screen at /games/<slug>.
export const GAMES = [
  { slug: "balance-ball", name: "Balance Ball", icon: "◉", desc: "Dodge the sock ball in the middle, then switch sides when a player is hit." },
  { slug: "touch", name: "Touch", icon: "↗", desc: "Run the lines, turn at the far side, and try to make it home." },
  { slug: "hide-and-seek", name: "Hide and Seek · Play Kech", cta: "Hide and Seek", icon: "◉", desc: "Count at home, then search the yard for everyone hiding." },
  { slug: "draft", name: "Draft", icon: "▦", desc: "A bottle-top strategy game played on a 10×10 board." },
  { slug: "marbles", name: "Marbles", icon: "◎", desc: "Flick your shooter and knock marbles out of the ring." },
  { slug: "tin-tan-to", name: "Tin Tan To", icon: "✕", desc: "Three pieces each on a drawn board. Slide along the lines to make three in a row." },
  { slug: "ludo", name: "Ludo", icon: "⚄", desc: "Two dice, four tokens, and six house rules from Poison Arrow to Taxi." },
] as const;

export type GameSlug = (typeof GAMES)[number]["slug"];

export function findGame(slug: string) {
  return GAMES.find((game) => game.slug === slug);
}
