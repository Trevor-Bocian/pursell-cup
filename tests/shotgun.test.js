// Shotgun starts. A group that tees off somewhere other than the low hole of
// its nine must have holes-remaining counted from where it started: walking the
// nine numerically treats a group off 14 as already five holes deep, and closes
// the match out with most of the loop still to play.
// Pulls the real functions out of pursell-cup.html.
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
const rx = n => new RegExp("var\\s+" + n + "\\s*=\\s*\\[([^\\]]+)\\]");
const arr = n => src.match(rx(n))[1].split(",").map(s => Number(s.trim()));
const strs = n => src.match(rx(n))[1].split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));

const FORMATS_SRC = src.match(/var FORMATS = \{[\s\S]*?\n\};/)[0];
const names = ["siOf","holesOf","playOrder","ranksOf","player","chOf","round",
  "allocation","strokesOnHole","sideStrokes","pStrokes","holeWinner","evalMatch"];
const ENV = new Function("S","SI_PLAYED","SI_PLAYED_SESSIONS",
  FORMATS_SRC + "\n" + names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};");

const players = [
  { id:"a1", name:"A One", ch:10, team:"a" },
  { id:"b1", name:"B One", ch:10, team:"b" }
];
const S = { si: arr("SI"), par: arr("PAR"), players, results: {} };
const E = ENV(S, arr("SI_PLAYED"), strs("SI_PLAYED_SESSIONS"));

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

const back  = { id:"s6", day:"Saturday", format:"singles", nine:"back"  };
const front = { id:"s5", day:"Saturday", format:"singles", nine:"front" };
const M = start => Object.assign({ id:"g", aIds:["a1"], bIds:["b1"] }, start ? { start } : {});
const evalWith = (m, sess, holes) => { S.results.g = { holes }; return E.evalMatch(m, sess); };

console.log("=== play order ===");
eq("no start rotates by zero", E.playOrder(back, M()), [10,11,12,13,14,15,16,17,18]);
eq("start on the low hole is also identity", E.playOrder(back, M(10)), [10,11,12,13,14,15,16,17,18]);
eq("off 14 wraps", E.playOrder(back, M(14)), [14,15,16,17,18,10,11,12,13]);
eq("off 18 wraps", E.playOrder(back, M(18)), [18,10,11,12,13,14,15,16,17]);
eq("front off 5 wraps", E.playOrder(front, M(5)), [5,6,7,8,9,1,2,3,4]);
eq("a hole not on this nine is ignored", E.playOrder(back, M(3)), [10,11,12,13,14,15,16,17,18]);
eq("garbage start is ignored", E.playOrder(back, M("x")), [10,11,12,13,14,15,16,17,18]);

console.log("\n=== the bug this fixes ===");
{
  // group off 14 wins its first three holes: 14, 15, 16
  const holes = { 14:"A", 15:"A", 16:"A" };
  const off14 = evalWith(M(14), back, holes);
  eq("three holes in, still live", off14.closed, false);
  eq("and reads as three played", off14.label, "3 UP thru 3");

  // the same scores with no start hole are what the board used to show
  const naive = evalWith(M(), back, holes);
  eq("without a start it closed after three holes", naive.closed, true);
  eq("labelled as though the round were over", naive.label, "3&2");
}

console.log("\n=== closeout counted from the tee ===");
{
  const h = {}; [14,15,16,17,18].forEach(x => h[x] = "A");
  const e = evalWith(M(14), back, h);
  eq("five up with four to play closes 5&4", e.label, "5&4");
  eq("closed", e.closed, true);
  eq("point awarded", [e.pts.a, e.pts.b], [1, 0]);
}
{
  // one up with one to play must stay open, wherever the group started
  const h = { 14:"A" }; [15,16,17,18,10,11,12].forEach(x => h[x] = "H");
  const e = evalWith(M(14), back, h);
  eq("1 up thru 8 is not closed", e.closed, false);
  eq("label counts holes played", e.label, "1 UP thru 8");
}
{
  const h = { 14:"A" }; [15,16,17,18,10,11,12,13].forEach(x => h[x] = "H");
  const e = evalWith(M(14), back, h);
  eq("1 up after nine is final", [e.label, e.pts.a], ["1 UP", 1]);
}

console.log("\n=== a full loop pays the same wherever it starts ===");
{
  // A takes 5 holes, B takes 4 — A wins by one regardless of the tee
  const won = { 14:"A",15:"A",16:"A",17:"A",18:"A", 10:"B",11:"B",12:"B",13:"B" };
  const off14 = evalWith(M(14), back, won);
  eq("off 14: closed on the fifth hole, 5&4", off14.label, "5&4");
  eq("off 14: one point to A", [off14.pts.a, off14.pts.b], [1, 0]);

  const off10 = evalWith(M(), back, won);
  eq("off 10: same winner", [off10.pts.a, off10.pts.b], [1, 0]);
  // the label differs because the holes fell in a different order, which is correct
  eq("off 10: label reflects its own order", off10.label, "1 UP");
}
{
  const halved = {}; [10,11,12,13,14,15,16,17,18].forEach(h => halved[h] = "H");
  [undefined, 12, 14, 18].forEach(st => {
    const e = evalWith(M(st), back, halved);
    eq("all halved off " + (st || "10") + " -> half a point each",
       [e.label, e.pts.a, e.pts.b], ["Halved", 0.5, 0.5]);
  });
}

console.log("\n=== strokes never move ===");
{
  const hi = [{ id:"a1", name:"A One", ch:10, team:"a" },
              { id:"b1", name:"B One", ch:29, team:"b" }];
  const S2 = { si: arr("SI"), par: arr("PAR"), players: hi, results: {} };
  const E2 = ENV(S2, arr("SI_PLAYED"), strs("SI_PLAYED_SESSIONS"));
  const ranks = E2.ranksOf(back);
  const base = E2.allocation(M(), back);
  [12, 14, 18].forEach(st => {
    const al = E2.allocation(M(st), back);
    eq("off " + st + ": same stroke count", al.count, base.count);
    eq("off " + st + ": same side", al.side, base.side);
    const per = h => E2.sideStrokes(al, al.side, h, ranks);
    eq("off " + st + ": same shots hole by hole",
       [10,11,12,13,14,15,16,17,18].map(per),
       [10,11,12,13,14,15,16,17,18].map(h => E2.sideStrokes(base, base.side, h, ranks)));
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
