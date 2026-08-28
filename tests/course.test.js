// Course-data migration. The stroke index that drives allocation is S.si —
// stored per phone and mirrored into Firebase — not the SI constant. Editing
// the constant alone changes nothing for anyone who has already loaded the
// board, which is exactly how a corrected card failed to reach live phones.
// Pulls the real functions and the real card out of pursell-cup.html.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "pursell-cup.html"), "utf8");

function extract(name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("not found in source: " + name);
  let i = src.indexOf("{", start), depth = 0, inS = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (inS) { if (c === "\\") esc = true; else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) return src.slice(start, j + 1); }
  }
  throw new Error("unbalanced: " + name);
}
function constArray(name) {
  const m = src.match(new RegExp("var\\s+" + name + "\\s*=\\s*\\[([^\\]]+)\\]"));
  if (!m) throw new Error("could not find " + name);
  return m[1].split(",").map(s => Number(s.trim()));
}
function constNum(name) {
  const m = src.match(new RegExp("var\\s+" + name + "\\s*=\\s*(\\d+)"));
  if (!m) throw new Error("could not find " + name);
  return Number(m[1]);
}

const SI = constArray("SI"), PAR = constArray("PAR"), COURSE_V = constNum("COURSE_V");

// migrateCourse closes over S/SI/PAR/COURSE_V/saveLocal/toast as free variables.
const runMigrate = new Function("S", "SI", "PAR", "COURSE_V", `
  var saved = false; function saveLocal(){ saved = true; }
  var toasted = null; function toast(m){ toasted = m; }
  var setTimeout = function(fn){ fn(); };
  ${extract("migrateCourse")}
  migrateCourse();
  return { S: S, saved: saved, toasted: toasted };
`);
const migrate = S => runMigrate(S, SI, PAR, COURSE_V);

const merge = new Function(
  [extract("stamp"), extract("byId"), extract("newer"),
   extract("mergeResults"), extract("mergeState")].join("\n") +
  "\nreturn mergeState;")();

const ranksOf = new Function("S", "sess",
  extract("holesOf") + "\n" + extract("ranksOf") + "\nreturn ranksOf(sess);");

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

// The card as it shipped before the correction: 17 and 18 transposed.
const OLD_SI = [15,9,13,1,7,17,11,5,3, 14,6,2,18,4,10,12,8,16];
const base = extra => Object.assign(
  { cfgAt: 1000, players: [], sessions: [], results: {}, removed: {} }, extra);

console.log("=== a phone carrying the old card ===");
{
  const r = migrate(base({ si: OLD_SI.slice(), par: PAR.slice() }));
  eq("stored stroke index is replaced from the card", r.S.si, SI);
  eq("courseV is stamped", r.S.courseV, COURSE_V);
  eq("cfgAt advances so the correction propagates", r.S.cfgAt > 1000, true);
  eq("state is persisted", r.saved, true);
  eq("scorer is told", typeof r.toasted, "string");
}

console.log("\n=== a phone already on the current card ===");
{
  const hand = SI.slice(); hand[0] = 3; hand[2] = 15;   // a manual Setup edit
  const r = migrate(base({ si: hand, par: PAR.slice(), courseV: COURSE_V, cfgAt: 5000 }));
  eq("manual SI edits are left alone", r.S.si, hand);
  eq("no needless cfgAt bump", r.S.cfgAt, 5000);
  eq("no toast", r.toasted, null);
}

console.log("\n=== merge: a stale phone must not push the old card back ===");
{
  const stale = base({ si: OLD_SI.slice(), par: PAR.slice(), cfgAt: 9000 });  // newer!
  const fixed = base({ si: SI.slice(), par: PAR.slice(), courseV: COURSE_V, cfgAt: 2000 });
  eq("corrected card wins despite older cfgAt", merge(stale, fixed).si, SI);
  eq("and in the other direction", merge(fixed, stale).si, SI);
  eq("courseV carries through", merge(stale, fixed).courseV, COURSE_V);
}

console.log("\n=== merge: same course version falls back to recency ===");
{
  const a = base({ si: SI.slice(), par: PAR.slice(), courseV: COURSE_V, cfgAt: 2000 });
  const edited = SI.slice(); edited[0] = 3;
  const b = base({ si: edited, par: PAR.slice(), courseV: COURSE_V, cfgAt: 9000 });
  eq("newer manual edit wins", merge(a, b).si, edited);
}

console.log("\n=== what the scorer actually sees on the back nine ===");
{
  const S = migrate(base({ si: OLD_SI.slice(), par: PAR.slice() })).S;
  const rb = ranksOf(S, { nine: "back" });
  eq("hole 17 ranks #8", rb[17], 8);
  eq("hole 18 ranks #4", rb[18], 4);
  // 5 strokes reaches ranks 1-5: that is 18, never 17. The reported symptom.
  const shot = (n, hole) => Math.floor(n / 9) + (rb[hole] <= n % 9 ? 1 : 0);
  eq("5 strokes: 18 gets one", shot(5, 18), 1);
  eq("5 strokes: 17 gets none", shot(5, 17), 0);
  eq("4..7 strokes all favour 18 over 17",
     [4,5,6,7].map(n => [shot(n,18), shot(n,17)]),
     [[1,0],[1,0],[1,0],[1,0]]);
  eq("8 strokes reaches both", [shot(8,18), shot(8,17)], [1,1]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
