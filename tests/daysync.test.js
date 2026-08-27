// Verify per-day pairing mirror: same groups both nines, separate score records.
let S;
const reset = () => { S = { sessions: [
  {id:"s1",day:"Thursday",format:"scramble",  nine:"front",matches:[{id:"m1",aIds:[],bIds:[]},{id:"m2",aIds:[],bIds:[]}]},
  {id:"s2",day:"Thursday",format:"fourball",  nine:"back", matches:[{id:"m3",aIds:[],bIds:[]},{id:"m4",aIds:[],bIds:[]}]},
  {id:"s3",day:"Friday",  format:"shamble",   nine:"front",matches:[{id:"m5",aIds:[],bIds:[]}]},
  {id:"s4",day:"Friday",  format:"greensomes",nine:"back", matches:[{id:"m6",aIds:[],bIds:[]}]}
]}; };

const dayList=()=>{const o=[];S.sessions.forEach(s=>{if(!o.includes(s.day))o.push(s.day)});return o};
const dayPeers=d=>S.sessions.filter(x=>x.day===d);
function syncDay(s){
  dayPeers(s.day).forEach(p=>{ if(p.id===s.id) return;
    s.matches.forEach((m,i)=>{ if(!p.matches[i])return;
      p.matches[i].aIds=m.aIds.slice(); p.matches[i].bIds=m.bIds.slice(); }); });
}
function normalizeDays(){
  S.sessions.forEach(s=>dayPeers(s.day).forEach(p=>{ if(p.id===s.id)return;
    s.matches.forEach((m,i)=>{ const pm=p.matches[i];
      if(!pm||pm.aIds.length||pm.bIds.length)return;
      pm.aIds=m.aIds.slice(); pm.bIds=m.bIds.slice(); }); }));
}
let pass=0,fail=0;
const eq=(l,g,w)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a===b){pass++;console.log(`  ok   ${l}`)}else{fail++;console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`)}};

console.log("\n=== day helpers ===");
reset();
eq("three-day grouping collapses six sessions", dayList(), ["Thursday","Friday"]);
eq("Thursday has two nines", dayPeers("Thursday").map(s=>s.nine), ["front","back"]);

console.log("\n=== an edit on one nine mirrors to the other ===");
reset();
S.sessions[0].matches[0].aIds=["trevor","will"];
S.sessions[0].matches[0].bIds=["adam","billy"];
syncDay(S.sessions[0]);
eq("back nine match 1 got the same group", S.sessions[1].matches[0].aIds, ["trevor","will"]);
eq("back nine match 1 got the same opponents", S.sessions[1].matches[0].bIds, ["adam","billy"]);
eq("match 2 untouched", S.sessions[1].matches[1].aIds, []);
eq("match IDs stay distinct so scores don't collide",
   [S.sessions[0].matches[0].id, S.sessions[1].matches[0].id], ["m1","m3"]);

console.log("\n=== mirroring is a copy, not a shared reference ===");
reset();
S.sessions[0].matches[0].aIds=["trevor"];
syncDay(S.sessions[0]);
S.sessions[0].matches[0].aIds.push("will");
eq("mutating the front nine does not leak into the back", S.sessions[1].matches[0].aIds, ["trevor"]);

console.log("\n=== days stay independent ===");
reset();
S.sessions[0].matches[0].aIds=["trevor","will"];
syncDay(S.sessions[0]);
eq("Friday unaffected by a Thursday edit", S.sessions[2].matches[0].aIds, []);

console.log("\n=== normalizeDays is non-destructive ===");
reset();
S.sessions[0].matches[0].aIds=["trevor","will"];      // front nine set
S.sessions[1].matches[0].aIds=["chris","bobby"];      // back nine ALREADY set by hand
S.sessions[0].matches[1].aIds=["rob","brian"];        // front nine match 2 set
normalizeDays();
eq("existing hand-set pairing is preserved", S.sessions[1].matches[0].aIds, ["chris","bobby"]);
eq("empty peer match gets filled", S.sessions[1].matches[1].aIds, ["rob","brian"]);

console.log("\n=== full replace on a re-shuffle ===");
reset();
S.sessions[0].matches[0].aIds=["trevor","will"];
syncDay(S.sessions[0]);
S.sessions[0].matches[0].aIds=["chris","bobby"];       // re-shuffled
syncDay(S.sessions[0]);
eq("mirror overwrites rather than merging", S.sessions[1].matches[0].aIds, ["chris","bobby"]);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
