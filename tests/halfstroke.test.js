// Half strokes in singles.
//
// Rounding the halved difference to a whole number sent a half-stroke UP on both
// nines, so every odd course-handicap difference gained a stroke across the day:
// a 12 gave a 13 two shots where eighteen holes gives one. That distorted half of
// every possible pairing, always in the higher handicap's favour.
//
// Course handicaps are whole numbers, so half of one is always a multiple of 0.5
// and the difference needs no rounding at all.
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
const names = ["halfStrokes","strokeText","siOf","holesOf","playOrder","ranksOf",
  "player","chOf","round","allocation","strokesOnHole","sideStrokes","pStrokes",
  "holeWinner","evalMatch"];
const ENV = new Function("S","SI_PLAYED","SI_PLAYED_SESSIONS",
  FORMATS_SRC + "\n" + names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};");

let players = [];
const S = { si: arr("SI"), par: arr("PAR"), players, results: {} };
const E = ENV(S, arr("SI_PLAYED"), strs("SI_PLAYED_SESSIONS"));

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

const satF = { id:"s5", day:"Saturday", format:"singles",   nine:"front" };
const satB = { id:"s6", day:"Saturday", format:"singles",   nine:"back"  };
const thuB = { id:"s2", day:"Thursday", format:"fourball",  nine:"back"  };
const friB = { id:"s4", day:"Friday",   format:"greensomes",nine:"back"  };
const thuF = { id:"s1", day:"Thursday", format:"scramble",  nine:"front" };

function singles(chA, chB, sess) {
  players.length = 0;
  players.push({ id:"x", name:"X", ch:chA, team:"a" },
               { id:"y", name:"Y", ch:chB, team:"b" });
  return E.allocation({ id:"m", aIds:["x"], bIds:["y"] }, sess);
}

console.log("=== which formats carry halves ===");
eq("singles do",            E.halfStrokes(satF), true);
eq("and on the back too",   E.halfStrokes(satB), true);
eq("best ball does not",    E.halfStrokes(thuB), false);
eq("alt shot does not",     E.halfStrokes(friB), false);
eq("scramble does not",     E.halfStrokes(thuF), false);

console.log("\n=== the 12 against the 13 ===");
{
  const f = singles(12, 13, satF), b = singles(12, 13, satB);
  eq("half a stroke on the front", [f.count, f.side], [0.5, "b"]);
  eq("half a stroke on the back",  [b.count, b.side], [0.5, "b"]);
  eq("one stroke across the day",  f.count + b.count, 1);
  eq("neither nine is scratch",    [f.count > 0, b.count > 0], [true, true]);
  const ranks = E.ranksOf(satF);
  const got = E.holesOf(satF).map(h => E.sideStrokes(f, "b", h, ranks));
  eq("all of it on hole 4, the hardest", got, [0,0,0,0.5,0,0,0,0,0]);
}

console.log("\n=== every difference totals correctly over the day ===");
for (let d = 0; d <= 15; d++) {
  const f = singles(10, 10 + d, satF), b = singles(10, 10 + d, satB);
  eq("difference " + String(d).padStart(2) + " -> " +
     E.strokeText(f.count) + " + " + E.strokeText(b.count) + " = " + (f.count + b.count),
     f.count + b.count, d);
}

console.log("\n=== an odd difference is half on each nine ===");
[1,3,5,7,9,11].forEach(d => {
  const f = singles(10, 10 + d, satF), b = singles(10, 10 + d, satB);
  eq("difference " + d + ": " + E.strokeText(f.count) + " each nine",
     [f.count, b.count], [d/2, d/2]);
  eq("  and " + d + " is not a whole number of strokes", f.count % 1, 0.5);
});

console.log("\n=== an even difference is unchanged ===");
[0,2,4,6,8,10].forEach(d => {
  const f = singles(10, 10 + d, satF);
  eq("difference " + d + " -> " + f.count + " whole strokes per nine", f.count, d/2);
});

console.log("\n=== where the half lands ===");
{
  const ranks = E.ranksOf(satF), hs = E.holesOf(satF);
  const spread = n => hs.map(h => E.strokesOnHole(n, h, ranks));
  // rank order on the front is 4,9,8,5,2,7,3,1,6
  eq("½   -> half on the hardest hole only",   spread(0.5), [0,0,0,0.5,0,0,0,0,0]);
  eq("1½  -> full on the hardest, half on #2", spread(1.5), [0,0,0,1,0,0,0,0,0.5]);
  // rank 2 is hole 9 (SI 3) and rank 3 is hole 8 (SI 5), not the other way round
  eq("2½  -> two full, half on #3",            spread(2.5), [0,0,0,1,0,0,0,0.5,1]);
  eq("9½  -> one everywhere, half on #1",      spread(9.5), [1,1,1,1.5,1,1,1,1,1]);
  eq("10½ -> two on #1, one½ on #2",           spread(10.5), [1,1,1,2,1,1,1,1,1.5]);
  eq("a whole number is untouched",            spread(3), [0,0,0,1,0,0,0,1,1]);
  [0.5,1.5,2.5,9.5].forEach(n => {
    const tot = spread(n).reduce((a,b) => a+b, 0);
    eq(E.strokeText(n) + " distributes to exactly " + n, tot, n);
  });
}

console.log("\n=== a half stroke only breaks a tie ===");
{
  const al = singles(12, 13, satB);           // half a stroke to Y on the back
  const ranks = E.ranksOf(satB);
  const h = E.holesOf(satB).filter(x => E.sideStrokes(al, "b", x, ranks) > 0)[0];
  const m = { id:"mh", aIds:["x"], bIds:["y"] };
  const play = (a,b) => { S.results.mh = { scores: { [h]: { a:a, b:b } } };
                          return E.holeWinner(m, satB, S.results.mh, h, al, ranks); };
  eq("level gross goes to the man receiving", play(4,4), "B");
  eq("but a shot worse still loses",          play(4,5), "A");
  eq("and a shot better still wins",          play(5,4), "B");
  delete S.results.mh;
}

console.log("\n=== Thursday and Friday still round to whole strokes ===");
{
  players.length = 0;
  players.push({ id:"x", ch:12, team:"a" }, { id:"y", ch:13, team:"b" });
  const thu = E.allocation({ id:"m", aIds:["x"], bIds:["y"] }, thuB);
  eq("best ball: whole strokes only", [thu.strokes.x, thu.strokes.y], [0, 1]);

  players.length = 0;
  players.push({ id:"a1", ch:10, team:"a" }, { id:"a2", ch:14, team:"a" },
               { id:"b1", ch:12, team:"b" }, { id:"b2", ch:18, team:"b" });
  const fri = E.allocation({ id:"m", aIds:["a1","a2"], bIds:["b1","b2"] }, friB);
  eq("alt shot: whole strokes only", [fri.count, fri.count % 1], [1, 0]);
}

console.log("\n=== how it reads on a phone ===");
[[0,"0"],[0.5,"½"],[1,"1"],[1.5,"1½"],[2,"2"],[7.5,"7½"],[12,"12"]]
  .forEach(([n,t]) => eq(n + " shows as \"" + t + "\"", E.strokeText(n), t));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
