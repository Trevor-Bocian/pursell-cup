// Build a publish-ready file that carries the LIVE board's state instead of the
// repo's placeholder. Without this, publishing the repo copy wipes every score
// posted so far.
//
//   node tools/splice-state.js <live-artifact.html> [out]
//
// Pull the live file first with the Artifact tool (action: "read", url).
// Default out is dist/pursell-cup.live.html, which is gitignored.
const fs = require("fs");
const path = require("path");

const live = process.argv[2];
if (!live) { console.error("usage: node tools/splice-state.js <live-artifact.html> [out]"); process.exit(1); }
const out = process.argv[3] || path.join(__dirname, "..", "dist", "pursell-cup.live.html");

const RE = /<script id="app-state" type="application\/json">([\s\S]*?)<\/script>/g;

function liveState(html) {
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(html))) {
    try { const o = JSON.parse(m[1]); if (o && o.sessions) return m[1]; } catch (e) { /* not it */ }
  }
  return null;
}

const liveHtml = fs.readFileSync(live, "utf8");
const payload = liveState(liveHtml);
if (!payload) { console.error("no parseable app-state in " + live + " — refusing to publish blind"); process.exit(1); }

const srcPath = path.join(__dirname, "..", "pursell-cup.html");
const src = fs.readFileSync(srcPath, "utf8");

// Replace only the first block; the other textual matches are the app's own source.
let done = false;
const built = src.replace(RE, (whole, body) => {
  if (done) return whole;
  try { const o = JSON.parse(body); if (o && o.sessions) { /* already live */ } } catch (e) { /* placeholder */ }
  done = true;
  return '<script id="app-state" type="application/json">' + payload + "</script>";
});
if (!done) { console.error("no app-state block in source — aborting"); process.exit(1); }

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, built, "utf8");

const S = JSON.parse(payload);
const scored = Object.keys(S.results || {}).length;
const paired = (S.sessions || []).reduce((n, s) =>
  n + s.matches.filter(m => m.aIds.length && m.bIds.length).length, 0);
console.log(`\n  wrote ${out}`);
console.log(`  carried forward: ${S.players.length} players, ${paired} pairings, ${scored} match records`);
console.log(`  state timestamp: ${S.cfgAt ? new Date(S.cfgAt).toLocaleString() : "—"}\n`);
