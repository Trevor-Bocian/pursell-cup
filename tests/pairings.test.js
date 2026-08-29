// Which days mirror their pairings across the two nines, and which do not.
//
// Thursday and Friday keep a group together for both nines, so a pairing set on
// one mirrors onto the other. Saturday's singles switch opponents at the turn:
// each nine is its own draw, and mirroring would silently overwrite the back
// nine with the front. Drives the real functions out of pursell-cup.html —
// tests/daysync.test.js carries its own copies and cannot see this.
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
const strs = n => src.match(new RegExp("var\\s+" + n + "\\s*=\\s*\\[([^\\]]+)\\]"))[1]
  .split(",").map(x => x.trim().replace(/^["']|["']$/g, ""));

const INDEPENDENT_DAYS = strs("INDEPENDENT_DAYS");
const names = ["mirrorsPairings","dayPeers","dayList","syncDay","normalizeDays",
               "stamp","shuffle","autoPair","player","chOf"];
const FORMATS_SRC = src.match(/var FORMATS = \{[\s\S]*?\n\};/)[0];
const build = S => new Function("S","INDEPENDENT_DAYS",
  FORMATS_SRC + "\n" + names.map(extract).join("\n") +
  "\nreturn {" + names.join(",") + "};")(S, INDEPENDENT_DAYS);

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

const roster = [];
for (let i = 0; i < 10; i++) roster.push({ id:"a"+i, name:"A"+i, ch:5+i, team:"a" });
for (let i = 0; i < 10; i++) roster.push({ id:"b"+i, name:"B"+i, ch:4+i, team:"b" });

const state = () => ({
  players: roster,
  sessions: [
    { id:"s3", day:"Friday",   format:"shamble", nine:"front",
      matches:[{id:"f1",aIds:[],bIds:[]},{id:"f2",aIds:[],bIds:[]}] },
    { id:"s4", day:"Friday",   format:"greensomes", nine:"back",
      matches:[{id:"g1",aIds:[],bIds:[]},{id:"g2",aIds:[],bIds:[]}] },
    { id:"s5", day:"Saturday", format:"singles", nine:"front",
      matches:Array.from({length:10},(_,i)=>({id:"sf"+i,aIds:[],bIds:[]})) },
    { id:"s6", day:"Saturday", format:"singles", nine:"back",
      matches:Array.from({length:10},(_,i)=>({id:"sb"+i,aIds:[],bIds:[]})) }
  ]
});
const sess = (S, id) => S.sessions.filter(s => s.id === id)[0];

console.log("=== which days mirror ===");
{
  const S = state(), E = build(S);
  eq("Saturday is independent",  E.mirrorsPairings("Saturday"), false);
  eq("Friday mirrors",           E.mirrorsPairings("Friday"), true);
  eq("Thursday mirrors",         E.mirrorsPairings("Thursday"), true);
  eq("the list names Saturday",  INDEPENDENT_DAYS, ["Saturday"]);
}

console.log("\n=== Friday still mirrors ===");
{
  const S = state(), E = build(S);
  const f = sess(S,"s3");
  f.matches[0].aIds = ["a1","a2"]; f.matches[0].bIds = ["b1","b2"];
  E.syncDay(f);
  eq("the back nine takes the same group",
     [sess(S,"s4").matches[0].aIds, sess(S,"s4").matches[0].bIds],
     [["a1","a2"], ["b1","b2"]]);
}

console.log("\n=== Saturday does not ===");
{
  const S = state(), E = build(S);
  const f = sess(S,"s5"), b = sess(S,"s6");
  f.matches[0].aIds = ["a1"]; f.matches[0].bIds = ["b1"];
  E.syncDay(f);
  eq("the back nine is left empty", [b.matches[0].aIds, b.matches[0].bIds], [[], []]);

  // and a back-nine draw does not leak forward either
  b.matches[0].aIds = ["a5"]; b.matches[0].bIds = ["b7"];
  E.syncDay(b);
  eq("the front keeps its own", [f.matches[0].aIds, f.matches[0].bIds], [["a1"], ["b1"]]);
  eq("the back keeps its own",  [b.matches[0].aIds, b.matches[0].bIds], [["a5"], ["b7"]]);
}

console.log("\n=== normalizeDays leaves Saturday alone at boot ===");
{
  const S = state(), E = build(S);
  sess(S,"s5").matches[0].aIds = ["a1"];
  sess(S,"s5").matches[0].bIds = ["b1"];
  sess(S,"s3").matches[0].aIds = ["a3","a4"];
  sess(S,"s3").matches[0].bIds = ["b3","b4"];
  E.normalizeDays();
  eq("Friday's empty back match is filled from the front",
     sess(S,"s4").matches[0].aIds, ["a3","a4"]);
  eq("Saturday's back match stays empty",
     sess(S,"s6").matches[0].aIds, []);
}

console.log("\n=== auto-pairing each Saturday nine separately ===");
{
  const S = state(), E = build(S);
  const f = sess(S,"s5"), b = sess(S,"s6");
  E.autoPair(f); E.autoPair(b);

  [["front",f],["back",b]].forEach(([nm,s]) => {
    const seen = {};
    s.matches.forEach(m => m.aIds.concat(m.bIds).forEach(id => seen[id] = (seen[id]||0)+1));
    eq(nm + ": all 20 players out", Object.keys(seen).length, 20);
    eq(nm + ": nobody twice", Object.values(seen).filter(n => n > 1).length, 0);
    eq(nm + ": one a side in every match",
       s.matches.every(m => m.aIds.length === 1 && m.bIds.length === 1), true);
  });

  // the two draws are independent, so the pairings should not be identical
  const same = f.matches.filter((m,i) =>
    m.aIds[0] === b.matches[i].aIds[0] && m.bIds[0] === b.matches[i].bIds[0]).length;
  eq("the two nines are not the same card", same < 10, true);
}

console.log("\n=== a mirrored day is unaffected by auto-pair ===");
{
  const S = state(), E = build(S);
  const f = sess(S,"s3");
  E.autoPair(f); E.syncDay(f);
  eq("Friday's back nine matches the front",
     sess(S,"s4").matches.map(m => m.aIds.concat(m.bIds)),
     f.matches.map(m => m.aIds.concat(m.bIds)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
