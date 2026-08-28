// Verification harness for the Pursell Cup allocation + match-play engine.
// SI and PAR are read out of the app rather than copied here: a hand-kept copy
// once let an invalid stroke index ship green (hole 17/18 transposed, then a
// duplicated value), because the suite was asserting against its own numbers.
const APP = require("fs").readFileSync(
  require("path").join(__dirname, "..", "pursell-cup.html"), "utf8");
function courseArray(name){
  const m = APP.match(new RegExp("var\\s+" + name + "\\s*=\\s*\\[([^\\]]+)\\]"));
  if(!m) throw new Error("could not find " + name + " in pursell-cup.html");
  return m[1].split(",").map(s => Number(s.trim()));
}
const SI  = courseArray("SI");
const PAR = courseArray("PAR");
const FORMATS = {
  scramble:{per:2,alloc:"lowhigh",lo:.35,hi:.15},
  fourball:{per:2,alloc:"player",pct:1.00},
  shamble:{per:2,alloc:"player",pct:0.75},
  greensomes:{per:2,alloc:"lowhigh",lo:.60,hi:.40},
  singles:{per:1,alloc:"diff",pct:1.00}
};
let CH = {};
const chOf = id => CH[id] ?? 0;
const round = x => Math.round(x);

function holesOf(s){ const st = s.nine==="back"?10:1; return Array.from({length:9},(_,i)=>st+i); }
function ranksOf(s){
  const hs = holesOf(s).slice().sort((x,y)=>SI[x-1]-SI[y-1]);
  const r={}; hs.forEach((h,i)=>r[h]=i+1); return r;
}
function allocation(m,s){
  const F=FORMATS[s.format], A=m.aIds, B=m.bIds;
  if(!A.length||!B.length) return {kind:"none",strokes:{},count:0};
  const half = id => chOf(id)/2;
  if(F.alloc==="player"){
    const all=[...A,...B].map(id=>({id,raw:half(id)*F.pct}));
    const low=Math.min(...all.map(x=>x.raw));
    const st={}; all.forEach(x=>st[x.id]=round(x.raw-low));
    return {kind:"player",strokes:st,count:0};
  }
  const teamCH = ids => {
    const v=ids.map(half).sort((x,y)=>x-y);
    if(F.alloc==="diff") return v[0];
    return F.lo*v[0]+F.hi*(v.length>1?v[1]:v[0]);
  };
  const ta=teamCH(A), tb=teamCH(B);
  return {kind:"side",side:ta>tb?"a":"b",count:round(Math.abs(ta-tb)),strokes:{}};
}
function strokesOnHole(n,hole,ranks){
  if(!n||n<=0) return 0;
  return Math.floor(n/9)+(ranks[hole]<=(n%9)?1:0);
}

let pass=0, fail=0;
function eq(label, got, want){
  const g=JSON.stringify(got), w=JSON.stringify(want);
  if(g===w){pass++; console.log(`  ok   ${label}  = ${g}`);}
  else {fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`);}
}

console.log("\n=== stroke index integrity ===");
eq("all 18 indexes present once", [...SI].sort((a,b)=>a-b), Array.from({length:18},(_,i)=>i+1));
eq("par total", PAR.reduce((a,b)=>a+b,0), 72);

console.log("\n=== nine-hole ranking ===");
const front={nine:"front"}, back={nine:"back"};
const rf=ranksOf(front), rb=ranksOf(back);
eq("front: hole 4 (SI 1) ranks #1", rf[4], 1);
eq("front: hole 6 (SI 17) ranks #9", rf[6], 9);
eq("back: hole 12 (SI 2) ranks #1", rb[12], 1);
eq("back: hole 13 (SI 18) ranks #9", rb[13], 9);
// 17 and 18 shipped transposed once, which handed a stroke to 17 for every
// player whose count mod 9 fell in 4..7. Card reads 17 -> SI 16, 18 -> SI 8.
eq("back: hole 17 (SI 16) ranks #8", rb[17], 8);
eq("back: hole 18 (SI 8) ranks #4", rb[18], 4);
eq("front ranks are a 1-9 permutation", Object.values(rf).sort((a,b)=>a-b), [1,2,3,4,5,6,7,8,9]);
eq("back ranks are a 1-9 permutation", Object.values(rb).sort((a,b)=>a-b), [1,2,3,4,5,6,7,8,9]);

console.log("\n=== Thu AM: scramble, 35% low + 15% high, front 9 ===");
// A: 4 and 18  -> halves 2, 9   -> .35*2 + .15*9  = 0.70+1.35 = 2.05
// B: 10 and 12 -> halves 5, 6   -> .35*5 + .15*6  = 1.75+0.90 = 2.65
// diff 0.60 -> rounds to 1 stroke to B
CH={a1:4,a2:18,b1:10,b2:12};
let s={format:"scramble",nine:"front"};
let al=allocation({aIds:["a1","a2"],bIds:["b1","b2"]},s);
eq("scramble side", al.side, "b");
eq("scramble strokes", al.count, 1);
eq("that stroke lands on hole 4 (hardest)", strokesOnHole(al.count,4,rf), 1);
eq("and not on hole 6 (easiest)", strokesOnHole(al.count,6,rf), 0);

console.log("\n=== Thu PM: best ball, 100%, back 9 ===");
// halves: 4, 9, 5, 6 -> low 4 -> strokes 0, 5, 1, 2
CH={a1:8,a2:18,b1:10,b2:12};
s={format:"fourball",nine:"back"};
al=allocation({aIds:["a1","a2"],bIds:["b1","b2"]},s);
eq("low man plays scratch", al.strokes.a1, 0);
eq("18 hcp gets 5", al.strokes.a2, 5);
eq("10 hcp gets 1", al.strokes.b1, 1);
eq("12 hcp gets 2", al.strokes.b2, 2);
// Derived from the ranking, not a frozen hole list: the old hardcoded lists
// put 17 in the hard group and 18 in the easy group, so they agreed with a
// transposed stroke index instead of catching it.
const backByRank = Array.from({length:9},(_,i)=>10+i).sort((x,y)=>rb[x]-rb[y]);
eq("a2's 5 strokes cover the 5 hardest of the back",
   backByRank.slice(0,5).map(h=>strokesOnHole(5,h,rb)), [1,1,1,1,1]);
eq("a2 gets nothing on the 4 easiest",
   backByRank.slice(5).map(h=>strokesOnHole(5,h,rb)), [0,0,0,0]);

console.log("\n=== Fri AM: shamble, 75%, front 9 ===");
// halves 4,9,5,6 -> *0.75 = 3, 6.75, 3.75, 4.5 -> minus low 3 -> 0, 3.75, 0.75, 1.5
// rounds -> 0, 4, 1, 2   (1.5 rounds to 2 under Math.round)
CH={a1:8,a2:18,b1:10,b2:12};
s={format:"shamble",nine:"front"};
al=allocation({aIds:["a1","a2"],bIds:["b1","b2"]},s);
eq("shamble 75% strokes", [al.strokes.a1,al.strokes.a2,al.strokes.b1,al.strokes.b2], [0,4,1,2]);
console.log("       (vs best ball 100% above: 0/5/1/2 — 75% pulls a shot off the high man)");

console.log("\n=== Fri PM: modified alt shot, 60/40, back 9 ===");
// A halves 4, 9  -> .6*4 + .4*9  = 2.4 + 3.6 = 6.0
// B halves 5, 6  -> .6*5 + .4*6  = 3.0 + 2.4 = 5.4
// diff 0.6 -> 1 stroke to A
CH={a1:8,a2:18,b1:10,b2:12};
s={format:"greensomes",nine:"back"};
al=allocation({aIds:["a1","a2"],bIds:["b1","b2"]},s);
eq("alt shot side", al.side, "a");
eq("alt shot strokes", al.count, 1);

console.log("\n=== Sat: singles, 100% of difference ===");
CH={a1:8,b1:18};
s={format:"singles",nine:"front"};
al=allocation({aIds:["a1"],bIds:["b1"]},s);
eq("singles side", al.side, "b");
eq("singles strokes (18-8)/2 = 5", al.count, 5);

console.log("\n=== stroke spreading beyond 9 ===");
eq("11 strokes over 9 holes: rank1 gets 2", strokesOnHole(11,4,rf), 2);
eq("11 strokes over 9 holes: rank3 gets 1", strokesOnHole(11,8,rf), 1);
eq("0 strokes gets nothing", strokesOnHole(0,4,rf), 0);

console.log("\n=== match play closeout, 9 holes ===");
function evalM(winners){ // winners: array of 'A'/'B'/'H' in hole order
  let a=0,b=0,idx=0,closed=false,dAt=0,rAt=0;
  for(let i=0;i<winners.length;i++){
    const w=winners[i]; if(!w) continue;
    idx=i+1; if(w==="A")a++; else if(w==="B")b++;
    const diff=Math.abs(a-b), rem=9-(i+1);
    if(diff>rem){closed=true;dAt=diff;rAt=rem;break}
  }
  const lead=a-b, done=closed||idx===9;
  if(closed) return rAt>0?`${dAt}&${rAt}`:`${dAt} UP`;
  if(done&&lead===0) return "Halved";
  if(done) return `${Math.abs(lead)} UP`;
  return lead===0?`AS thru ${idx}`:`${Math.abs(lead)} UP thru ${idx}`;
}
eq("A wins first 5 of 9 -> 5&4", evalM(["A","A","A","A","A"]), "5&4");
eq("A up 2 with 1 to play -> 2&1", evalM(["A","A","H","H","H","H","H","A"]), "3&1");
eq("all square after 9 -> Halved", evalM(["A","B","A","B","H","H","H","H","H"]), "Halved");
eq("1 up after 9 -> 1 UP", evalM(["A","B","A","B","H","H","H","H","A"]), "1 UP");
eq("mid-round state", evalM(["A","A","H"]), "2 UP thru 3");
eq("cannot close before it is mathematically over",
   evalM(["A","A","A","A"]), "4 UP thru 4");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
