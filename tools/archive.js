// Turn a Firebase export into a permanent, self-contained record of the event.
//
//   node tools/archive.js dist/fb-export.json [--team-a=Name] [--team-b=Name]
//
// Writes archive/<event-slug>.json (raw state, ordering restored) and
// archive/<event-slug>.md (human-readable results).
//
// The results are recomputed with the ACTUAL engine functions lifted out of
// pursell-cup.html rather than a reimplementation here, so the archived
// scoreboard is the one the app showed - half strokes, shotgun rotation,
// per-session stroke-index pins and all. If the app's math ever changes, this
// re-runs against the new math instead of silently preserving the old.
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const src = args.find(a => !a.startsWith("--"));
if (!src) { console.error("usage: node tools/archive.js <fb-export.json> [--team-a=Name]"); process.exit(1); }
const opt = k => { const a = args.find(x => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : null; };

const APP = path.join(__dirname, "..", "pursell-cup.html");
const appSrc = fs.readFileSync(APP, "utf8");

/* ---- lift the engine out of the app ---------------------------------- */
function extractFn(name) {
  const start = appSrc.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found: " + name);
  let depth = 0, inS = null, esc = false;
  for (let j = appSrc.indexOf("{", start); j < appSrc.length; j++) {
    const c = appSrc[j];
    if (esc) { esc = false; continue; }
    if (inS) { if (c === "\\") esc = true; else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) return appSrc.slice(start, j + 1); }
  }
  throw new Error("unbalanced: " + name);
}
function extractVar(name) {
  const re = new RegExp("var " + name + "\\s*=", "g");
  const m = re.exec(appSrc);
  if (!m) throw new Error("var not found: " + name);
  let depth = 0, inS = null, esc = false;
  for (let j = m.index; j < appSrc.length; j++) {
    const c = appSrc[j];
    if (esc) { esc = false; continue; }
    if (inS) { if (c === "\\") esc = true; else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === ";" && !depth) return appSrc.slice(m.index, j + 1);
  }
  throw new Error("unterminated var: " + name);
}

const VARS = ["FORMATS", "PAR", "SI", "SI_PLAYED", "SI_PLAYED_SESSIONS"];
const FNS = ["round", "halfStrokes", "holesOf", "playOrder", "siOf", "ranksOf",
             "player", "chOf", "nameOf", "sideNames", "allocation", "strokesOnHole",
             "strokeText", "pStrokes", "sideStrokes", "holeWinner", "evalMatch",
             "pts", "nineName", "sessName"];

const body = VARS.map(extractVar).join("\n") + "\n" + FNS.map(extractFn).join("\n") +
             "\nreturn {" + FNS.join(",") + "};";
let engine;
try { engine = new Function("S", body); }
catch (e) { console.error("could not build engine from pursell-cup.html: " + e.message); process.exit(1); }

/* ---- rebuild state from the export ----------------------------------- */
/* RTDB stores collections as {id: value} and hands keys back in arbitrary
   order, so every record carries an explicit `ord`. It also collapses a
   {1:..,2:..} map into a sparse array with a null at index 0. Both have to be
   undone or pairings scramble and hole numbers shift by one. */
const raw = JSON.parse(fs.readFileSync(src, "utf8"));
if (!raw || !raw.sessions) { console.error("no sessions in export - nothing to archive"); process.exit(1); }

const ordered = m => Object.values(m || {}).sort((x, y) => (x.ord || 0) - (y.ord || 0));
function holeMap(v) {
  if (!v) return {};
  if (!Array.isArray(v)) return v;
  const out = {};
  v.forEach((x, i) => { if (x !== null && x !== undefined) out[i] = x; });
  return out;
}

const S = {
  event: raw.meta.event, course: raw.meta.course,
  teams: {
    a: { name: opt("team-a") || raw.meta.teams.a.name },
    b: { name: opt("team-b") || raw.meta.teams.b.name }
  },
  si: raw.meta.si, par: raw.meta.par,
  courseV: raw.meta.courseV, rosterV: raw.meta.rosterV, cfgAt: raw.meta.cfgAt,
  players: ordered(raw.players),
  sessions: ordered(raw.sessions).map(s => ({
    id: s.id, day: s.day, format: s.format, nine: s.nine,
    si: s.si || undefined, at: s.at,
    matches: ordered(s.matches).map(m => ({
      id: m.id, aIds: m.aIds || [], bIds: m.bIds || [],
      start: m.start, at: m.at
    }))
  })),
  results: {}
};
Object.keys(raw.results || {}).forEach(k => {
  const r = raw.results[k];
  S.results[k] = { holes: holeMap(r.holes), scores: holeMap(r.scores),
                   mode: r.mode, updatedBy: r.updatedBy, updatedAt: r.updatedAt };
});

const E = engine(S);

/* ---- compute ---------------------------------------------------------- */
let A = 0, B = 0, decided = 0, unplayed = [];
const sessions = S.sessions.map(s => {
  let sa = 0, sb = 0;
  const matches = s.matches.map((m, i) => {
    const e = E.evalMatch(m, s);
    sa += e.pts.a; sb += e.pts.b;
    if (e.done) decided++; else if (e.played === 0) unplayed.push(E.sessName(s) + " match " + (i + 1));
    return {
      n: i + 1,
      a: E.sideNames(m.aIds), b: E.sideNames(m.bIds),
      label: e.label, done: e.done, pa: e.pts.a, pb: e.pts.b,
      start: m.start || null
    };
  });
  A += sa; B += sb;
  return { name: E.sessName(s), format: s.format, nine: s.nine, a: sa, b: sb, matches };
});
const total = S.sessions.reduce((n, s) => n + s.matches.length, 0);
const target = total / 2 + 0.5;

/* per-player record across every match they appeared in */
const rec = {};
S.players.forEach(p => rec[p.id] = { name: p.name, ch: p.ch, team: p.team, w: 0, l: 0, h: 0, pts: 0 });
S.sessions.forEach(s => s.matches.forEach(m => {
  const e = E.evalMatch(m, s);
  if (!e.done) return;
  const side = { a: m.aIds || [], b: m.bIds || [] };
  ["a", "b"].forEach(k => side[k].forEach(id => {
    if (!rec[id]) return;
    const mine = e.pts[k], theirs = e.pts[k === "a" ? "b" : "a"];
    rec[id].pts += mine;
    if (mine > theirs) rec[id].w++; else if (mine < theirs) rec[id].l++; else rec[id].h++;
  }));
}));

/* ---- write ------------------------------------------------------------ */
const slug = (S.event || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const year = new Date(S.cfgAt || Date.now()).getFullYear();
const base = path.join(__dirname, "..", "archive");
fs.mkdirSync(base, { recursive: true });
const stem = year + "-" + slug;

fs.writeFileSync(path.join(base, stem + ".json"), JSON.stringify(S, null, 2));

const winner = A > B ? S.teams.a.name : B > A ? S.teams.b.name : null;
const L = [];
L.push("# " + S.event + " " + year);
L.push("");
L.push(S.course);
L.push("");
L.push("## Final");
L.push("");
L.push("| | |");
L.push("|---|---|");
L.push("| **" + S.teams.a.name + "** | **" + E.pts(A) + "** |");
L.push("| **" + S.teams.b.name + "** | **" + E.pts(B) + "** |");
L.push("");
L.push(winner
  ? "**" + winner + "** wins, " + E.pts(Math.max(A, B)) + " to " + E.pts(Math.min(A, B)) +
    " (" + E.pts(target) + " needed of " + total + ")."
  : "**Tied** at " + E.pts(A) + " apiece.");
L.push("");
L.push(decided + " of " + total + " matches decided.");
if (unplayed.length) L.push("Never started: " + unplayed.join(", ") + ".");
L.push("");
sessions.forEach(s => {
  L.push("## " + s.name + " — " + s.format);
  L.push("");
  L.push("**" + S.teams.a.name + " " + E.pts(s.a) + " – " + E.pts(s.b) + " " + S.teams.b.name + "**");
  L.push("");
  L.push("| # | " + S.teams.a.name + " | " + S.teams.b.name + " | Result |");
  L.push("|---|---|---|---|");
  s.matches.forEach(m => {
    const res = m.pa === m.pb && m.done ? "Halved"
      : m.pa > m.pb ? m.label + " " + S.teams.a.name
      : m.pb > m.pa ? m.label + " " + S.teams.b.name
      : m.label;
    L.push("| " + m.n + " | " + m.a + " | " + m.b + " | " + res + " |");
  });
  L.push("");
});
L.push("## Player records");
L.push("");
L.push("| Player | Team | CH | W | L | H | Pts |");
L.push("|---|---|---|---|---|---|---|");
Object.values(rec)
  .sort((x, y) => y.pts - x.pts || x.name.localeCompare(y.name))
  .forEach(r => L.push("| " + r.name + " | " + S.teams[r.team].name + " | " + r.ch +
    " | " + r.w + " | " + r.l + " | " + r.h + " | " + E.pts(r.pts) + " |"));
L.push("");
L.push("---");
L.push("");
L.push("Recomputed from the Firebase export with the engine in `pursell-cup.html`.");
L.push("Raw state: `" + stem + ".json`.");
L.push("");
fs.writeFileSync(path.join(base, stem + ".md"), L.join("\n"));

console.log("");
console.log("  " + S.teams.a.name + " " + E.pts(A) + " – " + E.pts(B) + " " + S.teams.b.name +
            (winner ? "   (" + winner + " wins)" : "   (tied)"));
console.log("  " + decided + "/" + total + " matches decided" +
            (unplayed.length ? ", " + unplayed.length + " never started" : ""));
console.log("");
sessions.forEach(s => console.log("  " + s.name.padEnd(13) + s.format.padEnd(12) +
  E.pts(s.a) + " - " + E.pts(s.b)));
console.log("");
console.log("  wrote archive/" + stem + ".json");
console.log("  wrote archive/" + stem + ".md");
console.log("");
