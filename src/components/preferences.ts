// Per-viewer preferences; storage can be unavailable (private mode, blocked site data), so every access is guarded.

// Shared by every game, so muting one mutes them all.
export const MUTED_KEY = "salone-muted";

export function readFlag(key: string) {
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}

export function writeFlag(key: string, value: boolean) {
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* preference is not saved */ }
}
