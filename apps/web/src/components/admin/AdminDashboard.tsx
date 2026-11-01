"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { DayStat, LiveView, StatsView } from "@salone/games/online/admin";
import { GAMES } from "@/components/games";
import { serverUrl } from "@/online/useRoom";

// The admin dashboard: who is online and what they are playing (refreshed every few seconds), and play statistics
// over a chosen number of days. It reads the game server's /admin endpoints with the ADMIN_TOKEN secret, which is
// kept for this browser tab only.

const TOKEN_KEY = "salone-admin-token";
const LIVE_MS = 5000;
const STATS_MS = 60000;
const RANGES = [{ days: 1, label: "Today" }, { days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }];

const GAME_NAMES: Record<string, string> = Object.fromEntries(GAMES.map((g) => [g.slug, g.name.split(" · ")[0]]));
const MODE_NAMES: Record<string, string> = { cpu: "vs CPU", friends: "Pass and play", friend: "2 players", online: "Online", party: "Party screen", phone: "Party phone", solo: "Solo", unknown: "Unknown" };
const gameName = (game: string | null) => (game ? GAME_NAMES[game] ?? game : "Browsing the games");
const modeName = (mode: string | null) => (mode ? MODE_NAMES[mode] ?? mode : "—");
const who = (name: string, visitorId: string) => name || `Guest ${visitorId.slice(0, 4).toUpperCase()}`;

// 75 → "1m 15s"; 5400 → "1h 30m".
function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function readToken() { try { return window.sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } }
function saveToken(token: string) { try { if (token) window.sessionStorage.setItem(TOKEN_KEY, token); else window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* Storage blocked: this page only. */ } }

class AuthError extends Error {}

async function getJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${serverUrl()}/admin/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401) throw new AuthError("That admin token is not right.");
  if (response.status === 404) throw new AuthError("The admin dashboard is off: set ADMIN_TOKEN on the game server.");
  if (!response.ok) throw new Error(`The game server answered ${response.status}.`);
  return (await response.json()) as T;
}

export default function AdminDashboard() {
  const [token, setToken] = useState(readToken);
  const [authError, setAuthError] = useState("");
  // Stable, so the dashboard's refresh timers are not restarted on every render.
  const signOut = useCallback((error = "") => { saveToken(""); setAuthError(error); setToken(""); }, []);
  if (!token) return <SignIn error={authError} onSignIn={(t) => { saveToken(t); setAuthError(""); setToken(t); }} />;
  return <Dashboard token={token} onSignOut={signOut} />;
}

function SignIn({ error, onSignIn }: { error: string; onSignIn: (token: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (value.trim()) onSignIn(value.trim()); };
  return <main className="admin-screen admin-signin">
    <form className="admin-card admin-signin-card" onSubmit={submit}>
      <p className="admin-eyebrow">SALONE PLAYGROUND</p>
      <h1>Admin dashboard</h1>
      <p className="admin-muted">Enter the admin token set as ADMIN_TOKEN on the game server.</p>
      <input type="password" autoComplete="current-password" aria-label="Admin token" placeholder="Admin token" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="submit">SIGN IN</button>
      <Link href="/" className="admin-link">← Back to the games</Link>
    </form>
  </main>;
}

function Dashboard({ token, onSignOut }: { token: string; onSignOut: (error?: string) => void }) {
  const [days, setDays] = useState(7);
  const [live, setLive] = useState<LiveView | null>(null);
  const [stats, setStats] = useState<StatsView | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async <T,>(path: string, set: (value: T) => void) => {
    try { set(await getJson<T>(path, token)); setError(""); }
    catch (e) { if (e instanceof AuthError) onSignOut(e.message); else setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Cannot reach the game server. Retrying…"); }
  }, [token, onSignOut]);

  useEffect(() => {
    const tick = () => void load<LiveView>("live", setLive);
    tick();
    const timer = window.setInterval(tick, LIVE_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const tick = () => void load<StatsView>(`stats?days=${days}`, setStats);
    tick();
    const timer = window.setInterval(tick, STATS_MS);
    return () => window.clearInterval(timer);
  }, [load, days]);

  return <main className="admin-screen">
    <header className="admin-header">
      <div><strong>SALONE PLAYGROUND</strong><small>ADMIN</small></div>
      <div className="admin-header-right">
        {live && <span className="admin-muted admin-updated"><span className="admin-pulse" aria-hidden="true" />Live · updated {new Date(live.at).toLocaleTimeString()}</span>}
        <button className="admin-ghost" onClick={() => onSignOut()}>SIGN OUT</button>
      </div>
    </header>
    <div className="admin-content">
      {error && <p className="admin-error admin-banner" role="alert">{error}</p>}
      <LiveSection live={live} />
      <section className="admin-section" aria-labelledby="stats-title">
        <div className="admin-section-head">
          <h2 id="stats-title">Statistics</h2>
          <div className="admin-range" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => <button key={r.days} role="radio" aria-checked={days === r.days} className={days === r.days ? "on" : ""} onClick={() => { if (r.days !== days) { setStats(null); setDays(r.days); } }}>{r.label}</button>)}
          </div>
        </div>
        {stats ? <Stats stats={stats} /> : <p className="admin-muted">Loading statistics…</p>}
      </section>
    </div>
  </main>;
}

function LiveSection({ live }: { live: LiveView | null }) {
  if (!live) return <section className="admin-section"><h2>Live now</h2><p className="admin-muted">Connecting to the game server…</p></section>;
  const byGame = new Map<string, number>();
  for (const p of live.people) if (p.playing && p.game) byGame.set(p.game, (byGame.get(p.game) ?? 0) + 1);
  const games = [...byGame.entries()].sort((a, b) => b[1] - a[1]);
  return <section className="admin-section" aria-labelledby="live-title">
    <h2 id="live-title">Live now</h2>
    <div className="admin-tiles">
      <Tile label="Online now" value={String(live.online)} />
      <Tile label="Playing now" value={String(live.playing)} />
      <Tile label="Browsing" value={String(live.online - live.playing)} />
      <Tile label="Open rooms" value={String(live.rooms.length)} />
    </div>
    {games.length > 0 && <div className="admin-chips" aria-label="Playing now by game">{games.map(([game, n]) => <span key={game}>{gameName(game)} <b>{n}</b></span>)}</div>}
    <div className="admin-card">
      <h3>Players online</h3>
      {live.people.length === 0 ? <p className="admin-muted">Nobody is online right now.</p> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Player</th><th>Doing</th><th>Mode</th><th className="num">Playing for</th><th className="num">Online for</th></tr></thead>
        <tbody>{live.people.map((p) => <tr key={p.visitorId}>
          <td>{who(p.name, p.visitorId)}{p.screens > 1 && <small className="admin-muted"> · {p.screens} screens</small>}</td>
          <td><span className={`admin-status ${p.playing ? "playing" : ""}`}>{p.playing ? "Playing" : p.game ? "Setting up" : "Browsing"}</span> {gameName(p.game)}</td>
          <td>{p.game ? modeName(p.mode) : "—"}</td>
          <td className="num">{p.playing ? duration(p.playingSeconds) : "—"}</td>
          <td className="num">{duration(p.onlineSeconds)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    {live.rooms.length > 0 && <div className="admin-card">
      <h3>Open online rooms</h3>
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Room</th><th>Game</th><th>Status</th><th className="num">People</th><th className="num">Computers</th><th className="num">Last change</th></tr></thead>
        <tbody>{live.rooms.map((r) => <tr key={r.code}>
          <td className="mono">{r.code}{r.party && <small className="admin-muted"> · party</small>}</td>
          <td>{gameName(r.game === "tintanto" ? "tin-tan-to" : r.game)}</td>
          <td>{r.status === "playing" ? "Playing" : "In the lobby"}</td>
          <td className="num">{r.people}</td>
          <td className="num">{r.computers}</td>
          <td className="num">{when(r.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
  </section>;
}

function Stats({ stats }: { stats: StatsView }) {
  const { totals } = stats;
  const maxGame = Math.max(1, ...stats.games.map((g) => g.seconds));
  return <>
    <div className="admin-tiles">
      <Tile label="Players" value={String(totals.players)} note={`${totals.newPlayers} new · ${totals.allTimePlayers} all time`} />
      <Tile label="Play time" value={duration(totals.seconds)} />
      <Tile label="Game sessions" value={String(totals.sessions)} />
      <Tile label="Average session" value={totals.sessions ? duration(totals.seconds / totals.sessions) : "—"} />
      <Tile label="Online matches finished" value={String(totals.matches)} />
    </div>
    {stats.days > 1 && <div className="admin-grid-2">
      <DayChart title="Play time per day" days={stats.daily} value={(d) => d.seconds} format={(d) => duration(d.seconds)} axis={(v) => (v >= 60 ? duration(Math.round(v / 60) * 60).replace(/ 0s$/, "") : duration(v))} />
      <DayChart title="Players per day" days={stats.daily} value={(d) => d.players} format={(d) => `${d.players} player${d.players === 1 ? "" : "s"} · ${d.sessions} session${d.sessions === 1 ? "" : "s"}`} axis={(v) => String(Math.round(v))} />
    </div>}
    <div className="admin-card">
      <h3>Games</h3>
      {stats.games.length === 0 ? <p className="admin-muted">No games played in this period yet.</p> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Game</th><th className="admin-bar-col">Play time</th><th className="num">Players</th><th className="num">Sessions</th><th className="num">Average</th><th className="num">Online matches</th></tr></thead>
        <tbody>{stats.games.map((g) => <tr key={g.game}>
          <td>{gameName(g.game)}</td>
          <td className="admin-bar-col"><span className="admin-hbar"><i style={{ width: `${(g.seconds / maxGame) * 100}%` }} /></span><span className="admin-hbar-label">{duration(g.seconds)}</span></td>
          <td className="num">{g.players}</td>
          <td className="num">{g.sessions}</td>
          <td className="num">{duration(g.seconds / g.sessions)}</td>
          <td className="num">{g.matches || "—"}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    <div className="admin-grid-2">
      <div className="admin-card">
        <h3>Top players</h3>
        {stats.topPlayers.length === 0 ? <p className="admin-muted">No players in this period yet.</p> : <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Player</th><th className="num">Play time</th><th className="num">Sessions</th><th>Games</th></tr></thead>
          <tbody>{stats.topPlayers.map((p) => <tr key={p.visitorId}>
            <td>{who(p.name, p.visitorId)}</td>
            <td className="num">{duration(p.seconds)}</td>
            <td className="num">{p.sessions}</td>
            <td>{p.games.map(gameName).join(", ")}</td>
          </tr>)}</tbody>
        </table></div>}
      </div>
      <div className="admin-card">
        <h3>How people play</h3>
        {stats.modes.length === 0 ? <p className="admin-muted">Nothing yet.</p> : <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>Mode</th><th className="num">Sessions</th><th className="num">Play time</th></tr></thead>
          <tbody>{stats.modes.map((m) => <tr key={m.mode}><td>{modeName(m.mode)}</td><td className="num">{m.sessions}</td><td className="num">{duration(m.seconds)}</td></tr>)}</tbody>
        </table></div>}
      </div>
    </div>
    <div className="admin-card">
      <h3>Recent game sessions</h3>
      {stats.recent.length === 0 ? <p className="admin-muted">No sessions in this period yet.</p> : <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Player</th><th>Game</th><th>Mode</th><th className="num">Started</th><th className="num">Length</th></tr></thead>
        <tbody>{stats.recent.map((r, i) => <tr key={`${r.visitorId}-${r.endedAt}-${i}`}>
          <td>{who(r.name, r.visitorId)}</td>
          <td>{gameName(r.game)}</td>
          <td>{modeName(r.mode)}</td>
          <td className="num">{when(r.startedAt)}</td>
          <td className="num">{duration(r.seconds)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    <p className="admin-muted admin-footnote">Statistics count game sessions once they end; games still in progress show under Live now. Days are in GMT.</p>
  </>;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="admin-tile"><small>{label}</small><strong>{value}</strong>{note && <span>{note}</span>}</div>;
}

// One measure per day as bars, with the value on hover or focus.
function DayChart({ title, days, value, format, axis }: { title: string; days: DayStat[]; value: (d: DayStat) => number; format: (d: DayStat) => string; axis: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map(value));
  const top = max > 0 ? max : 1;
  const shown = hover === null ? null : days[hover];
  const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
  // Label a few days along the bottom: the first, the last, and evenly between.
  const every = Math.max(1, Math.ceil(days.length / 6));
  return <figure className="admin-card admin-chart">
    <figcaption><h3>{title}</h3><span className="admin-muted">{shown ? `${dayLabel(shown.day)} · ${format(shown)}` : "Hover a bar for the day's figure"}</span></figcaption>
    <div className="admin-chart-body">
      <div className="admin-chart-axis" aria-hidden="true"><span>{axis(top)}</span><span>{axis(top / 2)}</span><span>0</span></div>
      <div className="admin-bars" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => <button key={d.day} className={`admin-bar ${hover === i ? "on" : ""}`} aria-label={`${dayLabel(d.day)}: ${format(d)}`}
          onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
          <i style={{ height: `${(value(d) / top) * 100}%` }} />
        </button>)}
      </div>
    </div>
    <div className="admin-chart-days" aria-hidden="true">{days.map((d, i) => <span key={d.day}>{i % every === 0 || i === days.length - 1 ? dayLabel(d.day) : ""}</span>)}</div>
  </figure>;
}
