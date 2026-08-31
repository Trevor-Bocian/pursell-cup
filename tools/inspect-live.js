// Inspect a downloaded copy of the live artifact: structural health, posted
// state, and any drift between the live roster and the one committed here.
//
//   node tools/inspect-live.js <path-to-artifact.html>
//
// Pull the file first with the Artifact tool (action: "read", url).
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) { console.error("usage: node tools/inspect-live.js <artifact.html>"); process.exit(1); }
const html = fs.readFileSync(file, "utf8");

/* Count only blocks that actually parse as our state. The app's own source
   contains the literal string `<script id="app-state"` twice — once in the
   STATE_RE regex, once in stateTag() — so naive text counting reports phantoms. */
const blocks = [];
const re = /<script id="app-state" type="application\/json">([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  try { const o = JSON.parse(m[1]); if (o && o.sessions) blocks.push(o); } catch (e) { /* not state */ }
}

const count = (r) => (html.match(r) || []).length;
console.log("\n=== structural health ===");
/* A file pulled from the live artifact carries the host runtime; a pre-publish
   source file does not, because the host injects it at serve time. Expect each
   accordingly instead of reporting a source build as broken. */
const isLive = html.indexOf("<!-- frame-runtime -->") >= 0;
console.log("  (" + (isLive ? "live artifact" : "pre-publish source") + ")");
const checks = [
  ["size",                 `${(html.length/1024).toFixed(1)} KB`, null],
  ["frame-runtime blocks", count(/<!--\s*frame-runtime\s*-->/g), isLive ? 1 : 0],
  ["<base href> tags",     count(/<base\s+href=/g), isLive ? 1 : 0],
  ["parseable state",      blocks.length,                         1],
  ["<title> tags",         count(/<title>/g),                     1]
];
let bad = 0;
checks.forEach(([label, got, want]) => {
  const ok = want === null || got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "BAD "} ${String(label).padEnd(21)} ${got}` +
              (want !== null && !ok ? `   (expected ${want})` : ""));
});
if (count(/<!--\s*frame-runtime\s*-->/g) > 1)
  console.log("  ^ runtime is stacking: the SHELL strip in pursell-cup.html is broken");

if (!blocks.length) { console.log("\n  no parseable app-state found\n"); process.exit(1); }
const S = blocks[0];

console.log("\n=== posted state ===");
console.log(`  event    ${S.event} @ ${S.course}`);
console.log(`  teams    ${S.teams.a.name} vs ${S.teams.b.name}`);
console.log(`  rosterV  ${S.rosterV}   players ${S.players.length}`);
console.log(`  cfgAt    ${S.cfgAt ? new Date(S.cfgAt).toLocaleString() : "—"}`);

/* Roster drift: compare the live board against ROSTER in pursell-cup.html. */
const src = fs.readFileSync(path.join(__dirname, "..", "pursell-cup.html"), "utf8");
const rm = src.match(/var ROSTER=\[([\s\S]*?)\n\];/);
const canon = {};
if (rm) {
  const rowRe = /\["([^"]+)",\s*([\d.]+),\s*(\d+),\s*"([ab])","(\w+)"\]/g;
  let r; while ((r = rowRe.exec(rm[1]))) canon[r[1]] = { idx:+r[2], ch:+r[3], team:r[4] };
}
console.log("\n=== roster drift vs committed source ===");
let drift = 0;
S.players.forEach(p => {
  const c = canon[p.name];
  if (!c) { console.log(`  + ${p.name} — not in committed ROSTER (ch ${p.ch})`); drift++; return; }
  if (c.ch !== p.ch)   { console.log(`  ~ ${p.name}: committed ch ${c.ch} -> live ${p.ch}`); drift++; }
  if (c.team !== p.team) { console.log(`  ~ ${p.name}: committed team ${c.team} -> live ${p.team}`); drift++; }
});
Object.keys(canon).forEach(n => {
  if (!S.players.some(p => p.name === n)) { console.log(`  - ${n} — in source, missing from live board`); drift++; }
});
if (!drift) console.log("  none — live board matches the committed roster");

const tot = t => S.players.filter(p => p.team === t).reduce((x, p) => x + (+p.ch || 0), 0);
console.log(`\n  ${S.teams.a.name}: ${S.players.filter(p=>p.team==="a").length} players, CH ${tot("a")}`);
console.log(`  ${S.teams.b.name}: ${S.players.filter(p=>p.team==="b").length} players, CH ${tot("b")}`);

console.log("\n=== sessions ===");
S.sessions.forEach(s => {
  const set = s.matches.filter(x => x.aIds.length && x.bIds.length).length;
  console.log(`  ${s.day.slice(0,3)} ${s.nine==="back"?"Back 9":"Front 9"}  ${s.format.padEnd(11)} ${set}/${s.matches.length} paired`);
});

console.log("\n=== scores posted ===");
const R = S.results || {};
const keys = Object.keys(R);
if (!keys.length) console.log("  none yet");
keys.forEach(k => {
  const r = R[k];
  let where = "unknown session";
  S.sessions.forEach(s => s.matches.forEach((mm, i) => {
    if (mm.id === k) where = `${s.day.slice(0,3)} ${s.nine==="back"?"Back 9":"Front 9"} ${s.format}, match ${i+1}`;
  }));
  console.log(`  ${where}`);
  console.log(`    ${Object.keys(r.holes||{}).length} tapped, ${Object.keys(r.scores||{}).length} scored` +
    (r.updatedBy ? ` — last by "${r.updatedBy}" at ${new Date(r.updatedAt).toLocaleTimeString()}` : ""));
});
console.log("");
process.exit(bad ? 1 : 0);
