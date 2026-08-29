// Eighteen-hole allocation, split across the two nines.
//
// Halving each nine and rounding it independently sends a half-stroke up on
// BOTH nines, so every odd course-handicap difference gained a stroke across
// the day: a 12 gave a 13 two shots where eighteen holes gives one. That hit
// half of every possible pairing and always favoured the higher handicap.
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "pursell-cup.html"), "utf8");

const clean = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
                 .replace(/^([^\n"'`]*?)\/\/[^\n]*/gm,
                          (m, pre) => pre + " ".repeat(m.length - pre.length));
function extract(name) {
  const s = clean, start = s.indexOf("function " + name + "(");
  if (start < 0) throw new Error("not found in source: " + name);
  let i = s.indexOf("{", start), depth = 0, inS = null, esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (esc) { esc = false; continue; }
    if (inS) { if (c === "\\") esc = true; else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) return s.slice(start, j + 1); }
  }
  throw new Error("unbalanced: " + name);
}
const rx = n => new RegExp("var\\s+" + n + "\\s*=\\s*\\[([^\\]]+)\\]");
const arr = n => src.match(rx(n))[1].split(",").map(x => Number(x.trim()));
const strs = n => src.match(rx(n))[1].split(",").map(x => x.trim().replace(/^["']|["']$/g, ""));

const FORMATS_SRC = src.match(/var FORMATS = \{[\s\S]*?\n\};/)[0];
const names = ["splits18","nineShare","siOf","holesOf","playOrder","ranksOf",
  "player","chOf","round","allocation","strokesOnHole","sideStrokes","pStrokes"];
const ENV = new Function("S","SI_PLAYED","SI_PLAYED_SESSIONS","SPLIT18_SESSIONS",
  FORMATS_SRC + "\n" + names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};");

const SPLIT18 = strs("SPLIT18_SESSIONS");
let players = [];
const S = { si: arr("SI"), par: arr("PAR"), players, results: {} };
const E = ENV(S, arr("SI_PLAYED"), strs("SI_PLAYED_SESSIONS"), SPLIT18);

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

const satF = { id:"s5", day:"Saturday", format:"singles", nine:"front" };
const satB = { id:"s6", day:"Saturday", format:"singles", nine:"back"  };
const thuB = { id:"s2", day:"Thursday", format:"fourball", nine:"back" };
const friF = { id:"s3", day:"Friday",   format:"shamble",  nine:"front" };

function singles(chA, chB, sess) {
  players.length = 0;
  players.push({ id:"x", name:"X", ch:chA, team:"a" },
               { id:"y", name:"Y", ch:chB, team:"b" });
  return E.allocation({ id:"m", aIds:["x"], bIds:["y"] }, sess);
}

console.log("=== which sessions split ===");
eq("Saturday front splits", E.splits18(satF), true);
eq("Saturday back splits",  E.splits18(satB), true);
eq("Thursday does not",     E.splits18(thuB), false);
eq("Friday does not",       E.splits18(friF), false);
eq("the list is Saturday",  SPLIT18, ["s5","s6"]);

console.log("\n=== the 12 against the 13 ===");
{
  const f = singles(12, 13, satF), b = singles(12, 13, satB);
  eq("front: one stroke to the 13", [f.count, f.side], [1, "b"]);
  eq("back: scratch",               b.count, 0);
  eq("one stroke across the day",   f.count + b.count, 1);
  // and it lands on SI 1, the hardest hole on the course
  const ranks = E.ranksOf(satF);
  const got = E.holesOf(satF).filter(h => E.sideStrokes(f, "b", h, ranks) > 0);
  eq("on hole 4, stroke index 1", got, [4]);
}

console.log("\n=== the day's total equals the handicap difference ===");
for (let d = 0; d <= 15; d++) {
  const f = singles(10, 10 + d, satF), b = singles(10, 10 + d, satB);
  eq("difference " + String(d).padStart(2) + " -> " +
     String(f.count + b.count).padStart(2) + " over the day", f.count + b.count, d);
}

console.log("\n=== the front carries the extra when it is odd ===");
[1,3,5,7,9].forEach(d => {
  const f = singles(10, 10 + d, satF), b = singles(10, 10 + d, satB);
  eq("difference " + d + ": front " + f.count + ", back " + b.count,
     [f.count, b.count], [Math.ceil(d/2), Math.floor(d/2)]);
});

console.log("\n=== strokes still distribute exactly on each nine ===");
[[5,29],[12,13],[2,32],[7,7],[9,10]].forEach(([x,y]) => {
  [satF, satB].forEach(sess => {
    const al = singles(x, y, sess);
    const ranks = E.ranksOf(sess);
    let tot = 0;
    E.holesOf(sess).forEach(h => tot += E.sideStrokes(al, al.side, h, ranks));
    eq(x + " v " + y + " on the " + sess.nine + ": " + tot + " distributed", tot, al.count);
  });
});

console.log("\n=== Thursday and Friday are untouched ===");
{
  // per-nine halving, exactly as before: 12 v 13 -> round(0.5) -> 1 each nine
  players.length = 0;
  players.push({ id:"x", name:"X", ch:12, team:"a" },
               { id:"y", name:"Y", ch:13, team:"b" });
  const thu = E.allocation({ id:"m", aIds:["x"], bIds:["y"] }, thuB);
  eq("Thursday best ball still halves per nine",
     [thu.strokes.x, thu.strokes.y], [0, 1]);

  const alt = { id:"s4", day:"Friday", format:"greensomes", nine:"back" };
  players.length = 0;
  players.push({ id:"a1", ch:10, team:"a" }, { id:"a2", ch:14, team:"a" },
               { id:"b1", ch:12, team:"b" }, { id:"b2", ch:18, team:"b" });
  const fri = E.allocation({ id:"m", aIds:["a1","a2"], bIds:["b1","b2"] }, alt);
  // halved: a 5,7 -> .6*5+.4*7 = 5.8 ; b 6,9 -> .6*6+.4*9 = 7.2 ; diff 1.4 -> 1
  eq("Friday alt shot unchanged", [fri.count, fri.side], [1, "b"]);
}

console.log("\n=== a scratch match stays scratch ===");
[[10,10],[7,7],[5,5]].forEach(([x,y]) => {
  const f = singles(x, y, satF), b = singles(x, y, satB);
  eq(x + " v " + y + ": no strokes either nine", [f.count, b.count], [0, 0]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
