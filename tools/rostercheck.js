// Sanity-check the real Barn Burner roster against the allocation engine.
const R=[
 ["Adam Horsley",6.8,9,"b"],["Andrew Mattieson",0.7,2,"b"],["Billy Mehan",5.5,8,"b"],
 ["Bobby Keith",14.8,12,"a"],["Brandon King",18.0,23,"b"],["Brandon Lemke",11.0,14,"a"],
 ["Chris Miller",2.9,5,"a"],["Dennis Hall",5.1,7,"b"],["Dennis Hall Sr",5.4,5,"a"],
 ["Eric Hornsby",14.3,18,"b"],["Garrett Hayes",2.7,4,"b"],["Jackson Tutterow",5.0,7,"a"],
 ["Nathan Abner",23.2,29,"b"],["Paul Ettari",12.2,16,"b"],["Rob Hodgkiss",7.5,10,"a"],
 ["Brian Richards",6.0,9,"a"],["Stephen Pair",10.1,13,"b"],["Taki Skouras",25.4,32,"a"],
 ["Trevor Bocian",7.7,10,"a"],["Will Matthis",4.8,7,"a"]
];
const A=R.filter(p=>p[3]==="a"), B=R.filter(p=>p[3]==="b");
const sum=a=>a.reduce((x,y)=>x+y,0);
const rnd=x=>Math.round(x);

console.log("\n=== team balance ===");
console.log(`Trevor (A): ${A.length} players, CH total ${sum(A.map(p=>p[2]))}, avg ${(sum(A.map(p=>p[2]))/A.length).toFixed(1)}`);
console.log(`Andrew (B): ${B.length} players, CH total ${sum(B.map(p=>p[2]))}, avg ${(sum(B.map(p=>p[2]))/B.length).toFixed(1)}`);
console.log(`Spread across field: CH ${Math.min(...R.map(p=>p[2]))} to ${Math.max(...R.map(p=>p[2]))}`);

console.log("\n=== worst-case BEST BALL (100%), 9 holes ===");
console.log("Pairing the extremes to see the ceiling:");
// Taki(32)+Bobby(12) vs Mattieson(2)+Hayes(4)
const test=[["Taki Skouras",32],["Bobby Keith",12],["Andrew Mattieson",2],["Garrett Hayes",4]];
const halves=test.map(([n,ch])=>[n,ch/2]);
const low=Math.min(...halves.map(h=>h[1]));
console.log("  100%:", halves.map(([n,h])=>`${n} +${rnd(h-low)}`).join("  |  "));
const h75=test.map(([n,ch])=>[n,(ch/2)*0.75]);
const low75=Math.min(...h75.map(h=>h[1]));
console.log("   75%:", h75.map(([n,h])=>`${n} +${rnd(h-low75)}`).join("  |  "));
const h90=test.map(([n,ch])=>[n,(ch/2)*0.90]);
const low90=Math.min(...h90.map(h=>h[1]));
console.log("   90%:", h90.map(([n,h])=>`${n} +${rnd(h-low90)}`).join("  |  "));

console.log("\n  A 15-stroke allocation over 9 holes means:");
const n=15;
console.log(`    ${Math.floor(n/9)} shot on every hole, plus a 2nd on the ${n%9} hardest.`);

console.log("\n=== SINGLES: every possible A-vs-B stroke gap ===");
let gaps=[];
A.forEach(a=>B.forEach(b=>gaps.push(Math.round(Math.abs(a[2]-b[2])/2))));
gaps.sort((x,y)=>x-y);
console.log(`  min ${gaps[0]}, median ${gaps[Math.floor(gaps.length/2)]}, max ${gaps[gaps.length-1]}`);
const big=[];
A.forEach(a=>B.forEach(b=>{const g=Math.round(Math.abs(a[2]-b[2])/2); if(g>=10) big.push(`${a[0]}(${a[2]}) v ${b[0]}(${b[2]}) = ${g}`)}));
console.log(`  pairings giving 10+ strokes over nine holes: ${big.length} of ${gaps.length}`);
big.slice(0,6).forEach(s=>console.log("    "+s));

console.log("\n=== SCRAMBLE (35/15) team values, sorted ===");
function scr(p1,p2){const v=[p1[2]/2,p2[2]/2].sort((x,y)=>x-y);return .35*v[0]+.15*v[1]}
console.log("  If you paired high-with-low on each team:");
const Asort=[...A].sort((x,y)=>x[2]-y[2]), Bsort=[...B].sort((x,y)=>x[2]-y[2]);
for(let i=0;i<5;i++){
  const pa=[Asort[i],Asort[9-i]], pb=[Bsort[i],Bsort[9-i]];
  const ta=scr(pa[0],pa[1]), tb=scr(pb[0],pb[1]);
  console.log(`    ${pa[0][0]}/${pa[1][0]} (${ta.toFixed(2)}) v ${pb[0][0]}/${pb[1][0]} (${tb.toFixed(2)}) -> ${rnd(Math.abs(ta-tb))} stroke(s) to ${ta>tb?"Trevor":"Andrew"}`);
}
console.log("");
