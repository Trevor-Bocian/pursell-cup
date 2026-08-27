import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ------------------------------------------------------------------ */
/* tokens                                                              */
/* ------------------------------------------------------------------ */
const T = {
  bg: "#0B1714",
  panel: "#12211D",
  panelHi: "#18302A",
  line: "#22423A",
  bone: "#E8E4D6",
  dim: "#8FA79C",
  dimmer: "#5F776D",
  a: "#E8B23A",
  b: "#5B8DEF",
  halve: "#8FA79C",
  bad: "#D9705E",
};
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const UI = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const FORMATS = [
  { id: "scramble", label: "Scramble", perSide: 2 },
  { id: "fourball", label: "Fourball", perSide: 2 },
  { id: "shamble", label: "Shamble", perSide: 2 },
  { id: "greensomes", label: "Greensomes", perSide: 2 },
  { id: "foursomes", label: "Foursomes (alt shot)", perSide: 2 },
  { id: "singles", label: "Singles", perSide: 1 },
];
const fmt = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];
const uid = () => Math.random().toString(36).slice(2, 9);
const pts = (n) => (n % 1 === 0 ? String(n) : Math.floor(n) === 0 ? "½" : `${Math.floor(n)}½`);

/* ------------------------------------------------------------------ */
/* default event                                                       */
/* ------------------------------------------------------------------ */
function blankConfig() {
  return {
    eventName: "The Cup",
    course: "",
    teams: { a: { name: "Team A", color: T.a }, b: { name: "Team B", color: T.b } },
    players: [],
    strokeIndex: Array.from({ length: 18 }, (_, i) => i + 1),
    sessions: [],
    rev: 0,
  };
}

function standardSchedule() {
  const mk = (n) => Array.from({ length: n }, () => ({ id: uid(), aIds: [], bIds: [], strokes: { side: "a", count: 0 }, mode: "tap" }));
  return [
    { id: uid(), name: "Session 1", format: "scramble", matches: mk(5) },
    { id: uid(), name: "Session 2", format: "fourball", matches: mk(5) },
    { id: uid(), name: "Session 3", format: "shamble", matches: mk(5) },
    { id: uid(), name: "Session 4", format: "greensomes", matches: mk(5) },
    { id: uid(), name: "Singles", format: "singles", matches: mk(10) },
  ];
}

/* ------------------------------------------------------------------ */
/* match play math                                                     */
/* ------------------------------------------------------------------ */
function strokesOnHole(match, side, hole, config) {
  const s = match.strokes || { side: "a", count: 0 };
  if (s.side !== side || !s.count) return 0;
  const si = config.strokeIndex[hole - 1] || hole;
  const base = Math.floor(s.count / 18);
  const extra = s.count % 18;
  return base + (si <= extra ? 1 : 0);
}

function holeWinner(match, res, hole, config) {
  const tapped = res?.holes?.[hole];
  if (tapped) return tapped;
  const sc = res?.scores?.[hole];
  if (sc && sc.a != null && sc.b != null) {
    const na = sc.a - strokesOnHole(match, "a", hole, config);
    const nb = sc.b - strokesOnHole(match, "b", hole, config);
    if (na < nb) return "A";
    if (nb < na) return "B";
    return "H";
  }
  return null;
}

function evalMatch(match, res, config) {
  let a = 0, b = 0, played = 0, closed = false, diffAt = 0, remAt = 0, lastHole = 0;
  for (let h = 1; h <= 18; h++) {
    const w = holeWinner(match, res, h, config);
    if (!w) continue;
    played++;
    lastHole = h;
    if (w === "A") a++;
    else if (w === "B") b++;
    const diff = Math.abs(a - b);
    const rem = 18 - h;
    if (diff > rem) { closed = true; diffAt = diff; remAt = rem; break; }
  }
  const lead = a - b;
  const done = closed || (played > 0 && lastHole === 18);
  let label, points = { a: 0, b: 0 };

  if (closed) {
    label = remAt > 0 ? `${diffAt}&${remAt}` : `${diffAt} UP`;
    if (lead > 0) points.a = 1; else points.b = 1;
  } else if (done && lead === 0) {
    label = "Halved";
    points = { a: 0.5, b: 0.5 };
  } else if (done) {
    label = `${Math.abs(lead)} UP`;
    if (lead > 0) points.a = 1; else points.b = 1;
  } else if (played === 0) {
    label = "Not started";
  } else {
    label = lead === 0 ? `AS thru ${lastHole}` : `${Math.abs(lead)} UP thru ${lastHole}`;
  }
  return { a, b, played, lead, closed, done, label, points, lastHole };
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */
const CONFIG_KEY = "event:config";
const mKey = (id) => `m:${id}`;

async function loadConfig() {
  try {
    const r = await window.storage.get(CONFIG_KEY, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveConfig(cfg) {
  return window.storage.set(CONFIG_KEY, JSON.stringify(cfg), true);
}
async function loadResults() {
  const out = {};
  try {
    const listed = await window.storage.list("m:", true);
    const keys = listed?.keys || [];
    await Promise.all(keys.map(async (k) => {
      try {
        const r = await window.storage.get(k, true);
        if (r) out[k.slice(2)] = JSON.parse(r.value);
      } catch { /* skip unreadable match */ }
    }));
  } catch { /* nothing stored yet */ }
  return out;
}

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */
const Eyebrow = ({ children, style }) => (
  <div style={{ fontFamily: UI, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: T.dimmer, ...style }}>
    {children}
  </div>
);

function TugBar({ lead, cap = 5, height = 6, colorA, colorB }) {
  const clamped = Math.max(-cap, Math.min(cap, lead));
  const pos = 50 + (clamped / cap) * 50;
  const left = Math.min(50, pos);
  const width = Math.abs(pos - 50);
  return (
    <div style={{ position: "relative", height, background: T.panelHi, borderRadius: height, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: `${width}%`,
          background: lead > 0 ? colorA : colorB, transition: "left .35s ease, width .35s ease",
        }}
      />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: T.line }} />
    </div>
  );
}

function Btn({ children, onClick, tone = "quiet", disabled, style }) {
  const tones = {
    quiet: { bg: T.panelHi, fg: T.bone, bd: T.line },
    solid: { bg: T.bone, fg: T.bg, bd: T.bone },
    ghost: { bg: "transparent", fg: T.dim, bd: T.line },
    danger: { bg: "transparent", fg: T.bad, bd: "#4A2A26" },
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: UI, fontSize: 13, fontWeight: 600, padding: "9px 14px", borderRadius: 8,
        background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`,
        opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer", ...style,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle = {
  fontFamily: UI, fontSize: 14, background: T.bg, color: T.bone,
  border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 10px", width: "100%", outline: "none",
};

/* ------------------------------------------------------------------ */
/* app                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [config, setConfig] = useState(null);
  const [results, setResults] = useState({});
  const [view, setView] = useState("board");
  const [openMatch, setOpenMatch] = useState(null);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const refresh = useCallback(async (quiet) => {
    if (!quiet) setSyncing(true);
    const [cfg, res] = await Promise.all([loadConfig(), loadResults()]);
    if (cfg) setConfig(cfg);
    setResults(res);
    setSyncing(false);
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setConfig(cfg || blankConfig());
      setResults(await loadResults());
      try {
        const r = await window.storage.get("me", false);
        if (r) setMe(JSON.parse(r.value).name || "");
      } catch { /* no name set yet */ }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => { if (!openMatch) refresh(true); }, 25000);
    return () => clearInterval(t);
  }, [refresh, openMatch]);

  const saveTimer = React.useRef(null);
  const pushConfig = useCallback((next) => {
    setConfig(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await saveConfig(next); setError(""); }
      catch { setError("Couldn't save the setup. Check your connection and try again."); }
    }, 700);
  }, []);

  const pushResult = useCallback(async (matchId, next) => {
    setResults((r) => ({ ...r, [matchId]: next }));
    try {
      await window.storage.set(mKey(matchId), JSON.stringify(next), true);
      setError("");
    } catch {
      setError("That hole didn't save. Tap it again when you have signal.");
    }
  }, []);

  const setMyName = async (name) => {
    setMe(name);
    try { await window.storage.set("me", JSON.stringify({ name }), false); } catch { /* non-critical */ }
  };

  const totals = useMemo(() => {
    if (!config) return { a: 0, b: 0, total: 0, target: 0 };
    let a = 0, b = 0, total = 0;
    config.sessions.forEach((s) => s.matches.forEach((m) => {
      total += 1;
      const e = evalMatch(m, results[m.id], config);
      a += e.points.a; b += e.points.b;
    }));
    return { a, b, total, target: total / 2 + 0.5 };
  }, [config, results]);

  if (loading || !config) {
    return (
      <div style={{ minHeight: 400, background: T.bg, color: T.dim, fontFamily: UI, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading the board…
      </div>
    );
  }

  const teamA = config.teams.a, teamB = config.teams.b;
  const match = openMatch ? findMatch(config, openMatch) : null;

  return (
    <div style={{ background: T.bg, color: T.bone, fontFamily: UI, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${T.bone}; outline-offset: 2px; }
        input, select { color-scheme: dark; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <Header config={config} totals={totals} teamA={teamA} teamB={teamB} />

      {error ? (
        <div style={{ background: "#2A1714", color: T.bad, fontSize: 13, padding: "8px 16px", borderBottom: `1px solid #4A2A26` }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, padding: "16px 16px 96px" }}>
        {match ? (
          <MatchScreen
            match={match.match}
            session={match.session}
            config={config}
            res={results[match.match.id]}
            me={me}
            onBack={() => { setOpenMatch(null); refresh(true); }}
            onSave={pushResult}
          />
        ) : view === "board" ? (
          <Board config={config} results={results} totals={totals} onOpen={setOpenMatch} />
        ) : view === "matches" ? (
          <Matches config={config} results={results} onOpen={setOpenMatch} />
        ) : (
          <Setup
            config={config} results={results} me={me} unlocked={unlocked}
            setUnlocked={setUnlocked} onChange={pushConfig} setMyName={setMyName}
            reload={() => refresh(false)} setResults={setResults}
          />
        )}
      </div>

      {!match && (
        <Nav view={view} setView={setView} syncing={syncing} onRefresh={() => refresh(false)} />
      )}
    </div>
  );
}

function findMatch(config, id) {
  for (const s of config.sessions) {
    const m = s.matches.find((x) => x.id === id);
    if (m) return { match: m, session: s };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* header — the event-level tug of war                                 */
/* ------------------------------------------------------------------ */
function Header({ config, totals, teamA, teamB }) {
  const decided = totals.a + totals.b;
  const lead = totals.a - totals.b;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 5, background: T.panel, borderBottom: `1px solid ${T.line}`, padding: "14px 16px 12px" }}>
      <Eyebrow style={{ marginBottom: 8 }}>
        {config.eventName}{config.course ? ` · ${config.course}` : ""}
      </Eyebrow>
      <div className="flex items-end justify-between" style={{ marginBottom: 10 }}>
        <TeamScore team={teamA} score={totals.a} align="left" />
        <div style={{ textAlign: "center", paddingBottom: 4 }}>
          <div style={{ fontFamily: SERIF, fontSize: 12, color: T.dimmer, fontStyle: "italic" }}>
            {totals.target} to win
          </div>
        </div>
        <TeamScore team={teamB} score={totals.b} align="right" />
      </div>
      <TugBar lead={lead} cap={Math.max(3, totals.target - 1)} height={8} colorA={teamA.color} colorB={teamB.color} />
      <div style={{ fontFamily: MONO, fontSize: 10, color: T.dimmer, marginTop: 6, textAlign: "center" }}>
        {decided} of {totals.total} points decided
      </div>
    </div>
  );
}

function TeamScore({ team, score, align }) {
  return (
    <div style={{ textAlign: align, minWidth: 100 }}>
      <div style={{ fontFamily: UI, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: team.color, marginBottom: 2 }}>
        {team.name}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 40, lineHeight: 1, fontWeight: 700, color: T.bone }}>
        {pts(score)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* board                                                               */
/* ------------------------------------------------------------------ */
function Board({ config, results, totals, onOpen }) {
  const live = [];
  config.sessions.forEach((s) => s.matches.forEach((m) => {
    const e = evalMatch(m, results[m.id], config);
    if (e.played > 0 && !e.done) live.push({ m, s, e });
  }));

  if (!config.sessions.length) {
    return (
      <Empty
        title="No matches yet"
        body="Head to Setup, add your 20 players, then load the standard schedule to build the pairings."
      />
    );
  }

  return (
    <div>
      {live.length > 0 && (
        <>
          <SectionTitle>On the course</SectionTitle>
          <div className="flex flex-col gap-2" style={{ marginBottom: 24 }}>
            {live.map(({ m, s, e }) => (
              <MatchRow key={m.id} match={m} session={s} config={config} ev={e} onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      <SectionTitle>Sessions</SectionTitle>
      <div className="flex flex-col gap-3">
        {config.sessions.map((s) => {
          let a = 0, b = 0, done = 0;
          s.matches.forEach((m) => {
            const e = evalMatch(m, results[m.id], config);
            a += e.points.a; b += e.points.b;
            if (e.done) done++;
          });
          return (
            <div key={s.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 17 }}>{s.name}</div>
                  <Eyebrow style={{ marginTop: 3 }}>{fmt(s.format).label} · {s.matches.length} pts</Eyebrow>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>
                  <span style={{ color: config.teams.a.color }}>{pts(a)}</span>
                  <span style={{ color: T.dimmer }}> – </span>
                  <span style={{ color: config.teams.b.color }}>{pts(b)}</span>
                </div>
              </div>
              <TugBar lead={a - b} cap={Math.max(2, s.matches.length)} colorA={config.teams.a.color} colorB={config.teams.b.color} />
              <div style={{ fontFamily: MONO, fontSize: 10, color: T.dimmer, marginTop: 6 }}>
                {done}/{s.matches.length} matches final
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const SectionTitle = ({ children }) => (
  <div style={{ fontFamily: UI, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: T.dim, margin: "4px 0 10px" }}>
    {children}
  </div>
);

function Empty({ title, body }) {
  return (
    <div style={{ border: `1px dashed ${T.line}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: SERIF, fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* matches list                                                        */
/* ------------------------------------------------------------------ */
function Matches({ config, results, onOpen }) {
  const [tab, setTab] = useState(config.sessions[0]?.id);
  const session = config.sessions.find((s) => s.id === tab) || config.sessions[0];
  if (!session) return <Empty title="No sessions" body="Build your schedule in Setup first." />;

  return (
    <div>
      <div className="flex gap-2" style={{ overflowX: "auto", paddingBottom: 12, marginBottom: 4 }}>
        {config.sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setTab(s.id)}
            style={{
              fontFamily: UI, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              padding: "8px 12px", borderRadius: 999, cursor: "pointer",
              background: s.id === session.id ? T.bone : "transparent",
              color: s.id === session.id ? T.bg : T.dim,
              border: `1px solid ${s.id === session.id ? T.bone : T.line}`,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>
      <Eyebrow style={{ marginBottom: 10 }}>{fmt(session.format).label}</Eyebrow>
      <div className="flex flex-col gap-2">
        {session.matches.map((m) => (
          <MatchRow key={m.id} match={m} session={session} config={config} ev={evalMatch(m, results[m.id], config)} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function names(config, ids) {
  if (!ids || !ids.length) return "—";
  return ids.map((id) => config.players.find((p) => p.id === id)?.name || "?").join(" / ");
}

function MatchRow({ match, session, config, ev, onOpen }) {
  const leader = ev.lead > 0 ? "a" : ev.lead < 0 ? "b" : null;
  const color = leader ? config.teams[leader].color : T.halve;
  return (
    <button
      onClick={() => onOpen(match.id)}
      style={{
        display: "block", width: "100%", textAlign: "left", cursor: "pointer",
        background: T.panel, border: `1px solid ${T.line}`, borderLeft: `3px solid ${ev.played ? color : T.line}`,
        borderRadius: 10, padding: "12px 14px",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, color: config.teams.a.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {names(config, match.aIds)}
          </div>
          <div style={{ fontSize: 13, color: config.teams.b.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
            {names(config, match.bIds)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: ev.played ? T.bone : T.dimmer }}>
            {ev.label}
          </div>
          {ev.done && <Eyebrow style={{ marginTop: 3 }}>Final</Eyebrow>}
        </div>
      </div>
      {ev.played > 0 && (
        <div style={{ marginTop: 10 }}>
          <TugBar lead={ev.lead} cap={5} height={4} colorA={config.teams.a.color} colorB={config.teams.b.color} />
        </div>
      )}
      <Eyebrow style={{ marginTop: 8 }}>{session.name} · {fmt(session.format).label}</Eyebrow>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* match screen — hole entry                                           */
/* ------------------------------------------------------------------ */
function MatchScreen({ match, session, config, res, me, onBack, onSave }) {
  const data = res || { holes: {}, scores: {} };
  const ev = evalMatch(match, data, config);
  const mode = data.mode || match.mode || "tap";
  const [hole, setHole] = useState(Math.min(18, (ev.lastHole || 0) + 1));

  const write = (next) => onSave(match.id, { ...next, updatedBy: me || "someone", updatedAt: Date.now() });

  const setTap = (h, val) => {
    const holes = { ...data.holes };
    if (holes[h] === val) delete holes[h]; else holes[h] = val;
    write({ ...data, holes });
  };
  const setScore = (h, side, val) => {
    const scores = { ...data.scores };
    const cur = { ...(scores[h] || {}) };
    cur[side] = val === "" ? null : Math.max(1, Math.min(15, parseInt(val, 10) || 0));
    scores[h] = cur;
    write({ ...data, scores });
  };

  const ago = data.updatedAt ? Math.round((Date.now() - data.updatedAt) / 60000) : null;
  const w = holeWinner(match, data, hole, config);
  const giveA = strokesOnHole(match, "a", hole, config);
  const giveB = strokesOnHole(match, "b", hole, config);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <Btn tone="ghost" onClick={onBack}>← Back</Btn>
        <Eyebrow>{session.name} · {fmt(session.format).label}</Eyebrow>
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: config.teams.a.color }}>{names(config, match.aIds)}</div>
            <div style={{ fontSize: 14, color: config.teams.b.color, marginTop: 3 }}>{names(config, match.bIds)}</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>{ev.label}</div>
        </div>
        <TugBar lead={ev.lead} cap={5} height={6} colorA={config.teams.a.color} colorB={config.teams.b.color} />
        {match.strokes?.count > 0 && (
          <Eyebrow style={{ marginTop: 8 }}>
            {config.teams[match.strokes.side].name} gets {match.strokes.count} stroke{match.strokes.count === 1 ? "" : "s"}
          </Eyebrow>
        )}
        {ago !== null && (
          <Eyebrow style={{ marginTop: 6 }}>
            Last entry by {data.updatedBy} · {ago < 1 ? "just now" : `${ago}m ago`}
          </Eyebrow>
        )}
      </div>

      {ev.closed && (
        <div style={{ background: T.panelHi, border: `1px solid ${T.line}`, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: T.dim }}>
          Match is closed out at <strong style={{ color: T.bone }}>{ev.label}</strong>. Later holes won't change the result — you can still fix an earlier hole below.
        </div>
      )}

      {/* hole strip */}
      <div className="flex gap-1" style={{ overflowX: "auto", paddingBottom: 10 }}>
        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
          const hw = holeWinner(match, data, h, config);
          const c = hw === "A" ? config.teams.a.color : hw === "B" ? config.teams.b.color : hw === "H" ? T.halve : T.line;
          return (
            <button
              key={h}
              onClick={() => setHole(h)}
              style={{
                minWidth: 34, height: 44, borderRadius: 8, cursor: "pointer",
                background: h === hole ? T.panelHi : "transparent",
                border: `1px solid ${h === hole ? T.bone : T.line}`,
                color: T.bone, fontFamily: MONO, fontSize: 12, display: "flex",
                flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              }}
            >
              {h}
              <span style={{ width: 14, height: 3, borderRadius: 2, background: c, display: "block" }} />
            </button>
          );
        })}
      </div>

      {/* entry */}
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16, marginTop: 8 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: SERIF, fontSize: 20 }}>Hole {hole}</div>
          <Eyebrow>Stroke index {config.strokeIndex[hole - 1]}</Eyebrow>
        </div>

        {mode === "tap" ? (
          <div className="flex gap-2">
            {[
              { key: "A", label: config.teams.a.name, color: config.teams.a.color },
              { key: "H", label: "Halve", color: T.halve },
              { key: "B", label: config.teams.b.name, color: config.teams.b.color },
            ].map((o) => (
              <button
                key={o.key}
                onClick={() => setTap(hole, o.key)}
                style={{
                  flex: 1, padding: "16px 6px", borderRadius: 10, cursor: "pointer",
                  fontFamily: UI, fontSize: 13, fontWeight: 700,
                  background: w === o.key ? o.color : "transparent",
                  color: w === o.key ? T.bg : o.color,
                  border: `1px solid ${w === o.key ? o.color : T.line}`,
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {["a", "b"].map((side) => (
              <div key={side} className="flex items-center gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: config.teams[side].color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {names(config, side === "a" ? match.aIds : match.bIds)}
                  </div>
                  {(side === "a" ? giveA : giveB) > 0 && (
                    <Eyebrow style={{ marginTop: 2 }}>−{side === "a" ? giveA : giveB} stroke</Eyebrow>
                  )}
                </div>
                <input
                  type="number" inputMode="numeric" min="1" max="15"
                  value={data.scores?.[hole]?.[side] ?? ""}
                  onChange={(e) => setScore(hole, side, e.target.value)}
                  placeholder="–"
                  style={{ ...inputStyle, width: 70, textAlign: "center", fontFamily: MONO, fontSize: 18, padding: "12px 6px" }}
                />
              </div>
            ))}
            {w && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: T.dim, textAlign: "center" }}>
                {w === "H" ? "Hole halved" : `${config.teams[w.toLowerCase()].name} wins the hole`}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <Btn tone="ghost" onClick={() => setHole(Math.max(1, hole - 1))} disabled={hole === 1}>Prev</Btn>
          <button
            onClick={() => write({ ...data, mode: mode === "tap" ? "scores" : "tap" })}
            style={{ background: "none", border: "none", color: T.dimmer, fontFamily: UI, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
          >
            {mode === "tap" ? "Enter scores instead" : "Tap winner instead"}
          </button>
          <Btn tone="solid" onClick={() => setHole(Math.min(18, hole + 1))} disabled={hole === 18}>Next</Btn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* setup                                                               */
/* ------------------------------------------------------------------ */
function Setup({ config, results, me, unlocked, setUnlocked, onChange, setMyName, reload, setResults }) {
  const [bulk, setBulk] = useState("");

  const update = (patch) => onChange({ ...config, ...patch, rev: (config.rev || 0) + 1 });

  const addPlayers = (team) => {
    const lines = bulk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const added = lines.map((name) => ({ id: uid(), name, team }));
    update({ players: [...config.players, ...added] });
    setBulk("");
  };

  const removePlayer = (id) => {
    const sessions = config.sessions.map((s) => ({
      ...s,
      matches: s.matches.map((m) => ({ ...m, aIds: m.aIds.filter((x) => x !== id), bIds: m.bIds.filter((x) => x !== id) })),
    }));
    update({ players: config.players.filter((p) => p.id !== id), sessions });
  };

  const counts = { a: config.players.filter((p) => p.team === "a").length, b: config.players.filter((p) => p.team === "b").length };

  return (
    <div className="flex flex-col gap-4">
      <Card title="You">
        <Eyebrow style={{ marginBottom: 8 }}>Your name is stamped on holes you enter</Eyebrow>
        <input value={me} onChange={(e) => setMyName(e.target.value)} placeholder="Your name" style={inputStyle} />
      </Card>

      <Card title="Event">
        <div className="flex flex-col gap-3">
          <input value={config.eventName} onChange={(e) => update({ eventName: e.target.value })} placeholder="Event name" style={inputStyle} />
          <input value={config.course} onChange={(e) => update({ course: e.target.value })} placeholder="Course" style={inputStyle} />
          <div className="flex gap-3">
            {["a", "b"].map((k) => (
              <div key={k} style={{ flex: 1 }}>
                <Eyebrow style={{ marginBottom: 6 }}>Team {k.toUpperCase()} · {counts[k]} players</Eyebrow>
                <input
                  value={config.teams[k].name}
                  onChange={(e) => update({ teams: { ...config.teams, [k]: { ...config.teams[k], name: e.target.value } } })}
                  style={{ ...inputStyle, borderColor: config.teams[k].color, color: config.teams[k].color }}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Roster">
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"Paste names, one per line, then add them to a team"}
          rows={4}
          style={{ ...inputStyle, resize: "vertical", fontFamily: UI }}
        />
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <Btn onClick={() => addPlayers("a")} style={{ flex: 1, color: config.teams.a.color }}>Add to {config.teams.a.name}</Btn>
          <Btn onClick={() => addPlayers("b")} style={{ flex: 1, color: config.teams.b.color }}>Add to {config.teams.b.name}</Btn>
        </div>
        <div className="flex flex-col gap-1" style={{ marginTop: 12 }}>
          {config.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2" style={{ padding: "6px 0", borderBottom: `1px solid ${T.panelHi}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 6, background: config.teams[p.team].color }} />
              <input
                value={p.name}
                onChange={(e) => update({ players: config.players.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x) })}
                style={{ ...inputStyle, border: "none", background: "transparent", padding: "2px 0", flex: 1 }}
              />
              <button
                onClick={() => update({ players: config.players.map((x) => x.id === p.id ? { ...x, team: x.team === "a" ? "b" : "a" } : x) })}
                style={{ background: "none", border: "none", color: T.dimmer, fontSize: 11, cursor: "pointer" }}
              >
                swap
              </button>
              <button onClick={() => removePlayer(p.id)} style={{ background: "none", border: "none", color: T.bad, fontSize: 11, cursor: "pointer" }}>
                remove
              </button>
            </div>
          ))}
          {!config.players.length && <Eyebrow>No players yet</Eyebrow>}
        </div>
      </Card>

      <Card title="Schedule & pairings">
        {!config.sessions.length ? (
          <div>
            <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5, marginBottom: 10 }}>
              The standard build is five sessions — scramble, fourball, shamble, greensomes, then singles. Thirty points, 15½ to win.
            </div>
            <Btn tone="solid" onClick={() => update({ sessions: standardSchedule() })}>Load standard schedule</Btn>
          </div>
        ) : (
          <SessionEditor config={config} update={update} />
        )}
      </Card>

      <Card title="Course">
        <Eyebrow style={{ marginBottom: 8 }}>Stroke index by hole — used when a side is getting shots</Eyebrow>
        <div className="grid grid-cols-6 gap-2">
          {config.strokeIndex.map((si, i) => (
            <div key={i}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: T.dimmer, textAlign: "center" }}>{i + 1}</div>
              <input
                type="number" min="1" max="18" value={si}
                onChange={(e) => {
                  const next = [...config.strokeIndex];
                  next[i] = Math.max(1, Math.min(18, parseInt(e.target.value, 10) || 1));
                  update({ strokeIndex: next });
                }}
                style={{ ...inputStyle, padding: "6px 2px", textAlign: "center", fontFamily: MONO, fontSize: 12 }}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Danger zone">
        <Eyebrow style={{ marginBottom: 10 }}>Everyone with this app sees and edits the same board</Eyebrow>
        <div className="flex gap-2 flex-wrap">
          <Btn onClick={reload}>Reload from server</Btn>
          {!unlocked ? (
            <Btn tone="danger" onClick={() => setUnlocked(true)}>Unlock resets</Btn>
          ) : (
            <>
              <Btn
                tone="danger"
                onClick={async () => {
                  const listed = await window.storage.list("m:", true);
                  await Promise.all((listed?.keys || []).map((k) => window.storage.delete(k, true)));
                  setResults({});
                  setUnlocked(false);
                }}
              >
                Clear all scores
              </Btn>
              <Btn
                tone="danger"
                onClick={async () => {
                  const listed = await window.storage.list("m:", true);
                  await Promise.all((listed?.keys || []).map((k) => window.storage.delete(k, true)));
                  setResults({});
                  onChange(blankConfig());
                  setUnlocked(false);
                }}
              >
                Reset whole event
              </Btn>
              <Btn tone="ghost" onClick={() => setUnlocked(false)}>Cancel</Btn>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontFamily: SERIF, fontSize: 17, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function SessionEditor({ config, update }) {
  const [open, setOpen] = useState(config.sessions[0]?.id);
  const session = config.sessions.find((s) => s.id === open);

  const setSession = (patch) => update({
    sessions: config.sessions.map((s) => (s.id === session.id ? { ...s, ...patch } : s)),
  });
  const setMatch = (mid, patch) => setSession({
    matches: session.matches.map((m) => (m.id === mid ? { ...m, ...patch } : m)),
  });

  const used = new Set();
  session?.matches.forEach((m) => [...m.aIds, ...m.bIds].forEach((id) => used.add(id)));

  const autoPair = () => {
    const per = fmt(session.format).perSide;
    const pool = { a: shuffle(config.players.filter((p) => p.team === "a").map((p) => p.id)), b: shuffle(config.players.filter((p) => p.team === "b").map((p) => p.id)) };
    const matches = session.matches.map((m) => ({ ...m, aIds: pool.a.splice(0, per), bIds: pool.b.splice(0, per) }));
    setSession({ matches });
  };

  if (!session) return null;

  return (
    <div>
      <div className="flex gap-2" style={{ overflowX: "auto", paddingBottom: 10 }}>
        {config.sessions.map((s) => (
          <button
            key={s.id} onClick={() => setOpen(s.id)}
            style={{
              fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 999, whiteSpace: "nowrap", cursor: "pointer",
              background: s.id === open ? T.bone : "transparent", color: s.id === open ? T.bg : T.dim,
              border: `1px solid ${s.id === open ? T.bone : T.line}`,
            }}
          >{s.name}</button>
        ))}
      </div>

      <div className="flex gap-2" style={{ margin: "8px 0 12px" }}>
        <input value={session.name} onChange={(e) => setSession({ name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
        <select value={session.format} onChange={(e) => setSession({ format: e.target.value })} style={{ ...inputStyle, width: 150 }}>
          {FORMATS.map((f) => <option key={f.id} value={f.id} style={{ background: T.bg }}>{f.label}</option>)}
        </select>
      </div>

      <div className="flex gap-2" style={{ marginBottom: 12 }}>
        <Btn onClick={autoPair}>Auto-pair</Btn>
        <Btn onClick={() => setSession({ matches: [...session.matches, { id: uid(), aIds: [], bIds: [], strokes: { side: "a", count: 0 }, mode: "tap" }] })}>
          Add match
        </Btn>
      </div>

      <div className="flex flex-col gap-3">
        {session.matches.map((m, i) => (
          <div key={m.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 12 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <Eyebrow>Match {i + 1}</Eyebrow>
              <button
                onClick={() => setSession({ matches: session.matches.filter((x) => x.id !== m.id) })}
                style={{ background: "none", border: "none", color: T.bad, fontSize: 11, cursor: "pointer" }}
              >remove</button>
            </div>
            {["a", "b"].map((side) => (
              <div key={side} className="flex gap-2" style={{ marginBottom: 6 }}>
                {Array.from({ length: fmt(session.format).perSide }, (_, slot) => {
                  const ids = side === "a" ? m.aIds : m.bIds;
                  return (
                    <select
                      key={slot}
                      value={ids[slot] || ""}
                      onChange={(e) => {
                        const next = [...ids];
                        if (e.target.value) next[slot] = e.target.value; else next.splice(slot, 1);
                        setMatch(m.id, side === "a" ? { aIds: next.filter(Boolean) } : { bIds: next.filter(Boolean) });
                      }}
                      style={{ ...inputStyle, flex: 1, color: config.teams[side].color, fontSize: 13 }}
                    >
                      <option value="" style={{ background: T.bg }}>— open —</option>
                      {config.players.filter((p) => p.team === side).map((p) => (
                        <option key={p.id} value={p.id} disabled={used.has(p.id) && ids[slot] !== p.id} style={{ background: T.bg }}>
                          {p.name}{used.has(p.id) && ids[slot] !== p.id ? " (playing)" : ""}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Eyebrow style={{ flex: 1 }}>Strokes given</Eyebrow>
              <select
                value={m.strokes?.side || "a"}
                onChange={(e) => setMatch(m.id, { strokes: { ...m.strokes, side: e.target.value } })}
                style={{ ...inputStyle, width: 110, fontSize: 12 }}
              >
                <option value="a" style={{ background: T.bg }}>{config.teams.a.name}</option>
                <option value="b" style={{ background: T.bg }}>{config.teams.b.name}</option>
              </select>
              <input
                type="number" min="0" max="18" value={m.strokes?.count ?? 0}
                onChange={(e) => setMatch(m.id, { strokes: { side: m.strokes?.side || "a", count: Math.max(0, Math.min(18, parseInt(e.target.value, 10) || 0)) } })}
                style={{ ...inputStyle, width: 60, textAlign: "center", fontFamily: MONO }}
              />
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <Eyebrow style={{ flex: 1 }}>Scoring</Eyebrow>
              <select
                value={m.mode || "tap"}
                onChange={(e) => setMatch(m.id, { mode: e.target.value })}
                style={{ ...inputStyle, width: 176, fontSize: 12 }}
              >
                <option value="tap" style={{ background: T.bg }}>Tap the hole winner</option>
                <option value="scores" style={{ background: T.bg }}>Enter scores per hole</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* nav                                                                 */
/* ------------------------------------------------------------------ */
function Nav({ view, setView, syncing, onRefresh }) {
  const items = [
    { id: "board", label: "Board" },
    { id: "matches", label: "Matches" },
    { id: "setup", label: "Setup" },
  ];
  return (
    <div style={{ position: "sticky", bottom: 0, background: T.panel, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "stretch" }}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setView(it.id)}
          style={{
            flex: 1, padding: "14px 0", background: "none", border: "none", cursor: "pointer",
            fontFamily: UI, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
            color: view === it.id ? T.bone : T.dimmer,
            borderTop: `2px solid ${view === it.id ? T.bone : "transparent"}`, marginTop: -1,
          }}
        >
          {it.label}
        </button>
      ))}
      <button
        onClick={onRefresh}
        style={{ width: 56, background: "none", border: "none", borderLeft: `1px solid ${T.line}`, color: syncing ? T.bone : T.dimmer, cursor: "pointer", fontSize: 16 }}
        aria-label="Refresh the board"
      >
        ↻
      </button>
    </div>
  );
}
