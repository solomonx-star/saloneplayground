// Room chat for online and party play: short typed messages and one-tap phrases between the people in a room.
// Players are guests (often children), so the server tidies and filters every message before anyone sees it, and
// keeps only the last few in memory while the room is open. Chat is not saved, except that a report keeps the
// reported player's recent messages for the admins (for REPORT_DAYS).
//
// Anyone can mute another player on their own screen. A report goes to the admin dashboard, and once enough
// different people in the room have reported the same player (reportsToBlock) that player cannot chat there again.

export const MAX_CHAT = 140;
// How many recent messages the server keeps per room, for a screen that reloads or joins late.
export const CHAT_HISTORY = 50;
// At most this many messages from one person in CHAT_WINDOW_MS.
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

// One-tap messages: quick to send on a phone mid-game.
export const QUICK_PHRASES = ["Good luck!", "Good move!", "Nice one!", "Your turn!", "Hurry up!", "Oops!", "Well played!", "Rematch?"] as const;
export const QUICK_EMOJI = ["👍", "😂", "👏", "🔥", "😮", "🎉"] as const;

// A message from a player, or from the room itself (`system`, with no guestId), such as a player being blocked.
export type ChatMessage = { id: number; guestId: string; name: string; text: string; at: number; system?: boolean };
// What a screen gets on entering a room: the recent messages, and the players blocked from chatting there.
export type ChatState = { messages: ChatMessage[]; blocked: string[] };

export const REPORT_REASONS = {
  rude: "Rude or mean messages",
  personal: "Asking for personal details",
  spam: "Spam or flooding the chat",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const isReportReason = (value: unknown): value is ReportReason => typeof value === "string" && Object.hasOwn(REPORT_REASONS, value);
// Reports (with the messages they keep) are deleted after this many days.
export const REPORT_DAYS = 30;
// How many of the reported player's recent messages a report keeps.
export const REPORT_MESSAGES = 10;

// How many different people must report a player before they are blocked from the room's chat: 2, or 1 when the
// room has only two people (the reporter is the only one who could).
export function reportsToBlock(people: number) { return people <= 2 ? 1 : 2; }

// A report as the admin dashboard shows it.
export type ChatReportView = {
  id: string;
  room: string;
  game: string;
  reported: { guestId: string; name: string };
  reporter: { guestId: string; name: string };
  reason: ReportReason;
  messages: { text: string; at: string }[];
  at: string;
  // Whether the reports in that room blocked the player from chatting.
  blocked: boolean;
};

// Tidies typed text: no control characters, single-spaced, trimmed, at most MAX_CHAT characters. Null if nothing is left.
export function cleanChat(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const tidy = text.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(tidy);
  const cut = chars.length > MAX_CHAT ? chars.slice(0, MAX_CHAT).join("").trim() : tidy;
  return cut || null;
}

// Words that are hidden wherever they appear as a whole word (after undoing look-alike spellings such as "sh1t").
// A starting point in English: add local words (Krio and others) here as the team finds them.
const BLOCKED_WORDS = ["ass", "arse", "arsehole", "asshole", "bastard", "bitch", "bollocks", "boob", "boobs", "cock", "crap", "cunt", "dick", "dicks", "dildo", "fag", "fags", "faggot", "fuck", "hoe", "horny", "jizz", "nigga", "niggas", "nigger", "niggers", "penis", "piss", "porn", "pussy", "rape", "retard", "sex", "sexy", "shit", "slut", "tit", "tits", "twat", "vagina", "wank", "wanker", "whore"];
// Stems hidden at the start of any word too ("fucking", "shitty"); none of them begins an everyday word.
const BLOCKED_STEMS = ["fuck", "shit", "bitch", "cunt", "faggot", "whore", "slut", "wank", "porn", "dildo", "jizz", "pussy", "asshol", "arsehol", "bastard", "retard"];

const LOOK_ALIKES: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };

// A word as the filter compares it: lower case, look-alikes undone, other symbols dropped.
function plain(word: string) {
  return Array.from(word.toLowerCase()).map((c) => LOOK_ALIKES[c] ?? c).join("").replace(/[^a-z]/g, "");
}

function blocked(word: string) {
  const text = plain(word);
  if (!text) return false;
  // Stretched words ("fuuuuck") count as the word.
  const squeezed = text.replace(/(.)\1{2,}/g, "$1");
  return [text, squeezed].some((w) => BLOCKED_WORDS.includes(w) || BLOCKED_STEMS.some((stem) => w.startsWith(stem)))
    || BLOCKED_WORDS.includes(text.replace(/(.)\1+/g, "$1"));
}

// Links, email addresses and phone numbers are replaced: guests should not swap contact details or send people to
// other sites.
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|app|me|ly|gg|tv|co|sl|uk|info|xyz|link)\b(?:\/\S*)?/gi;
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;

// Hides blocked words (as asterisks) and contact details in a cleaned message.
export function filterChat(text: string): string {
  const safe = text.replace(EMAIL, "[email]").replace(LINK, "[link]").replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 7 ? "[number]" : match));
  return safe.replace(/[^\s]+/g, (word) => {
    if (word === "[email]" || word === "[link]" || word === "[number]") return word;
    // Keep punctuation around the word ("shit!" becomes "****!").
    const [, before, core, after] = /^([^\p{L}\p{N}@$!]*)(.*?)([^\p{L}\p{N}@$]*)$/u.exec(word) ?? ["", "", word, ""];
    return blocked(core) ? `${before}${"*".repeat(Array.from(core).length)}${after}` : word;
  });
}
