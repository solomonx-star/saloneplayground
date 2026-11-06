"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { io } from "socket.io-client";
import type { DayStat, LiveView, StatsView, TrafficView } from "@salone/games/online/admin";
import { REPORT_DAYS, REPORT_REASONS, type ChatReportView } from "@salone/games/online/chat";
import { EVENTS, pageOfGame, type Reply } from "@salone/games/online/protocol";
import { GAMES } from "@/components/games";
import { connectOptions, reconnectWhenBack, serverUrl } from "@/online/useRoom";

// The admin dashboard: who is online and what they are playing, and play statistics over a chosen number of days.
// It signs in to the game server with the ADMIN_TOKEN secret (kept for this browser tab only). The live view is
// pushed over Socket.IO the moment anything changes; statistics are read over HTTP and read again as soon as the
// server says a game session has ended.

const TOKEN_KEY = "salone-admin-token";
// How often the data-use figures are read while the dashboard is open.
const TRAFFIC_MS = 10_000;
// A slow safety refresh of the statistics (for example when a new day starts); pushes cover everything else.
const STATS_MS = 5 * 60 * 1000;
// Several sessions ending together cause one statistics read.
const STATS_SETTLE_MS = 800;
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
  // When the live view on show arrived (this device's clock), so its timers can count on between pushes.
  const [liveAt, setLiveAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<StatsView | null>(null);
  // Goes up each time the server says a game session ended: the statistics are read again.
  const [statsVersion, setStatsVersion] = useState(0);
  const [error, setError] = useState("");
  const [reports, setReports] = useState<ChatReportView[] | null>(null);
  // Goes up each time the server says a chat report came in or was dismissed: the reports are read again.
  const [reportsVersion, setReportsVersion] = useState(0);

  // The live view, pushed by the game server.
  useEffect(() => {
    const socket = io(serverUrl(), connectOptions(5000));
    const stopRetrying = reconnectWhenBack(socket);
    const show = (view: LiveView) => { setLive(view); setLiveAt(Date.now()); };
    socket.on("connect", async () => {
      const answer: Reply<LiveView> = await socket.emitWithAck(EVENTS.adminWatch, { token });
      if (!answer.ok) { onSignOut(answer.error); return; }
      setConnected(true); setError("");
      show(answer.value);
      // Sessions may have ended while the connection was down.
      setStatsVersion((v) => v + 1);
      setReportsVersion((v) => v + 1);
    });
    socket.on(EVENTS.adminReports, () => setReportsVersion((v) => v + 1));
    socket.on(EVENTS.adminLive, show);
    socket.on(EVENTS.adminSessions, () => setStatsVersion((v) => v + 1));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    return () => { stopRetrying(); socket.disconnect(); };
  }, [token, onSignOut]);

  // Timers on show count up every second.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The statistics: on opening, on changing the range, shortly after a session ends, and every few minutes.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try { const value = await getJson<StatsView>(`stats?days=${days}`, token); if (!cancelled) { setStats(value); setError(""); } }
      catch (e) { if (cancelled) return; if (e instanceof AuthError) onSignOut(e.message); else setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Cannot reach the game server. Retrying…"); }
    };
    const soon = window.setTimeout(read, statsVersion ? STATS_SETTLE_MS : 0);
    const timer = window.setInterval(read, STATS_MS);
    return () => { cancelled = true; window.clearTimeout(soon); window.clearInterval(timer); };
  }, [token, onSignOut, days, statsVersion]);

  // Chat reports waiting for an admin: on opening and whenever one comes in or is dismissed.
  useEffect(() => {
    let cancelled = false;
    getJson<ChatReportView[]>("reports", token).then(
      (value) => { if (!cancelled) setReports(value); },
      (e) => { if (!cancelled && e instanceof AuthError) onSignOut(e.message); },
    );
    return () => { cancelled = true; };
  }, [token, onSignOut, reportsVersion]);

  // Data use: read now and every few seconds; Reset starts the count again (to measure one session).
  const [traffic, setTraffic] = useState<TrafficView | null>(null);
  const [trafficVersion, setTrafficVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const read = () => getJson<TrafficView>("traffic", token).then(
      (value) => { if (!cancelled) setTraffic(value); },
      (e) => { if (!cancelled && e instanceof AuthError) onSignOut(e.message); },
    );
    void read();
    const timer = window.setInterval(read, TRAFFIC_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [token, onSignOut, trafficVersion]);

  async function resetTraffic() {
    const response = await fetch(`${serverUrl()}/admin/traffic/reset`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!response?.ok) setError("Could not reset the data-use count. Try again.");
    setTrafficVersion((v) => v + 1);
  }

  async function dismiss(id: string) {
    setReports((list) => list?.filter((r) => r.id !== id) ?? null);
    const response = await fetch(`${serverUrl()}/admin/reports/${id}/dismiss`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    if (!response?.ok) { setError("Could not dismiss that report. Try again."); setReportsVersion((v) => v + 1); }
  }

  const elapsed = liveAt ? Math.max(0, (now - liveAt) / 1000) : 0;
  return <main className="admin-screen">
    <header className="admin-header">
      <div><strong>SALONE PLAYGROUND</strong><small>ADMIN</small></div>
      <div className="admin-header-right">
        <span className={`admin-muted admin-updated ${connected ? "" : "offline"}`} role="status"><span className="admin-pulse" aria-hidden="true" />{connected ? "Live" : "Reconnecting…"}</span>
        <button className="admin-ghost" onClick={() => onSignOut()}>SIGN OUT</button>
      </div>
    </header>
    <div className="admin-content">
      {error && <p className="admin-error admin-banner" role="alert">{error}</p>}
      {!connected && live && <p className="admin-error admin-banner" role="alert">Lost the live connection to the game server. Reconnecting… (the figures below may be out of date)</p>}
      <ReportsSection reports={reports} onDismiss={(id) => void dismiss(id)} />
      <LiveSection live={live} elapsed={elapsed} />
      <TrafficSection traffic={traffic} onReset={() => void resetTraffic()} />
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

// Data use per game: what each player's device downloads and uploads per minute of play, and which messages cost the
// most. Counted on the game server since it started or since the last reset.
const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`);
function TrafficSection({ traffic, onReset }: { traffic: TrafficView | null; onReset: () => void }) {
  if (!traffic) return null;
  const games = traffic.games.filter((g) => g.playerMinutes > 0 || g.downBytes > 0);
  return <section className="admin-section" aria-labelledby="traffic-title">
    <div className="admin-section-head">
      <h2 id="traffic-title">Data use</h2>
      <button className="admin-ghost" onClick={onReset}>RESET</button>
    </div>
    <p className="admin-muted">Since {when(traffic.since)} ({duration(traffic.seconds)}). Per player: what one device downloads (↓) and uploads (↑) for each minute it has the game open. These are the messages before the connection compresses them; what a phone actually downloads is much less (about 85% less for Touch, measured).</p>
    {games.length === 0 ? <p className="admin-muted">Nothing counted yet.</p> : <div className="admin-card"><div className="admin-table-wrap"><table className="admin-table">
      <thead><tr><th>Game</th><th className="num">Player-minutes</th><th className="num">↓ per minute</th><th className="num">↑ per minute</th><th className="num">↓ total</th><th>Biggest messages</th></tr></thead>
      <tbody>{games.map((g) => <tr key={g.game}>
        <td>{g.game === "none" ? "Games shelf" : g.game === "admin" ? "Admin dashboards" : gameName(pageOfGame(g.game))}</td>
        <td className="num">{g.playerMinutes}</td>
        <td className="num">{g.kbPerMinuteDown === null ? "—" : `${g.kbPerMinuteDown} KB`}</td>
        <td className="num">{g.kbPerMinuteUp === null ? "—" : `${g.kbPerMinuteUp} KB`}</td>
        <td className="num">{kb(g.downBytes)}</td>
        <td><small className="admin-muted">{g.events.slice(0, 3).map((e) => `${e.direction === "down" ? "↓" : "↑"} ${e.event} ${kb(e.bytes)} (${e.messages}× · ${Math.round(e.bytes / Math.max(1, e.messages))} B each)`).join(" · ")}</small></td>
      </tr>)}</tbody>
    </table></div></div>}
  </section>;
}

// Chat reports from players, newest first, each with the reported player's recent messages. Dismissing one takes it
// off the list; every report is deleted on its own after REPORT_DAYS.
function ReportsSection({ reports, onDismiss }: { reports: ChatReportView[] | null; onDismiss: (id: string) => void }) {
  if (!reports) return null;
  return <section className="admin-section" aria-labelledby="reports-title">
    <div className="admin-section-head"><h2 id="reports-title">Chat reports{reports.length > 0 && <span className="admin-count">{reports.length}</span>}</h2></div>
    {reports.length === 0
      ? <p className="admin-muted">No chat reports waiting. Players can report someone from the chat&apos;s Players view; reports are kept for {REPORT_DAYS} days.</p>
      : <div className="admin-reports">{reports.map((r) => <article key={r.id} className="admin-card admin-report">
        <header>
          <div>
            <strong>{who(r.reported.name, r.reported.guestId)}</strong>
            {r.blocked && <span className="admin-badge">BLOCKED FROM CHAT</span>}
            <small className="admin-muted">{REPORT_REASONS[r.reason]} · reported by {who(r.reporter.name, r.reporter.guestId)} · {gameName(pageOfGame(r.game))} · room <span className="mono">{r.room}</span> · {when(r.at)}</small>
          </div>
          <button className="admin-ghost" onClick={() => onDismiss(r.id)}>DISMISS</button>
        </header>
        {r.messages.length === 0
          ? <p className="admin-muted">They had not sent any messages in that room before the report.</p>
          : <ol className="admin-report-messages">{r.messages.map((m, i) => <li key={i}><time className="admin-muted">{new Date(m.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time> {m.text}</li>)}</ol>}
      </article>)}</div>}
  </section>;
}

// `elapsed`: seconds since this view arrived, added to its timers so they keep counting between pushes.
function LiveSection({ live, elapsed }: { live: LiveView | null; elapsed: number }) {
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
          <td className="num">{p.playing ? duration(p.playingSeconds + elapsed) : "—"}</td>
          <td className="num">{duration(p.onlineSeconds + elapsed)}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    {live.rooms.length > 0 && <div className="admin-card">
      <h3>Open online rooms</h3>
      <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Room</th><th>Game</th><th>Status</th><th className="num">People</th><th className="num">Computers</th><th className="num">Last change</th></tr></thead>
        <tbody>{live.rooms.map((r) => <tr key={r.code}>
          <td className="mono">{r.code}{r.party && <small className="admin-muted"> · party</small>}</td>
          <td>{gameName(pageOfGame(r.game))}</td>
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
