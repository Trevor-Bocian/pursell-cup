// Firebase driver: ordering + empty-array round trip.
//
// RTDB stores players/sessions/matches as {id: value} maps, not arrays, and
// hands the keys back in whatever order the server feels like — never
// guaranteed to be insertion order. syncDay() mirrors pairings BY MATCH
// INDEX, so if a session's matches come back in the wrong order, pairings
// silently scramble onto the wrong slot. RTDB also drops an empty array
// (no children to store), so aIds/bIds come back missing, not [].
//
// This pulls the real toMap/fromMap/coerceIds/sessionsToMap/
// firebaseSnapshotToState out of pursell-cup.html — same extraction
// technique as merge.test.js — so it tests the shipped code, not a copy.
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
const names = ["toMap", "fromMap", "coerceIds", "sessionsToMap", "firebaseSnapshotToState"];
const sandbox = new Function(names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};")();
const { toMap, fromMap, coerceIds, sessionsToMap, firebaseSnapshotToState } = sandbox;

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

// Rebuild a plain object with its keys inserted in the given order, so the
// test actually exercises "unordered" rather than accidentally relying on
// V8 preserving insertion order.
function reorder(obj, keyOrder) {
  const out = {};
  keyOrder.forEach(k => { out[k] = obj[k]; });
  return out;
}

console.log("\n=== toMap / fromMap round-trip preserves order regardless of key order ===");
{
  const players = [
    { id: "p1", name: "Adam", ch: 6.8, at: 10 },
    { id: "p2", name: "Bobby", ch: 14.8, at: 10 },
    { id: "p3", name: "Chris", ch: 2.9, at: 10 }
  ];
  const map = toMap(players);
  eq("ord stamped from array position", [map.p1.ord, map.p2.ord, map.p3.ord], [0, 1, 2]);

  // Simulate RTDB handing the keys back in a scrambled order.
  const reversed = reorder(map, ["p3", "p1", "p2"]);
  eq("reversed map really is in that key order", Object.keys(reversed), ["p3", "p1", "p2"]);
  eq("fromMap re-sorts by ord, ignoring key order", fromMap(reversed).map(p => p.id), ["p1", "p2", "p3"]);
  eq("fromMap re-sorts by ord, ignoring key order (names)", fromMap(reversed).map(p => p.name), ["Adam", "Bobby", "Chris"]);
}

console.log("\n=== sessionsToMap / firebaseSnapshotToState: matches survive index-scrambled keys ===");
{
  const sessions = [
    { id: "s1", day: "Thursday", format: "scramble", nine: "front", at: 5,
      matches: [
        { id: "m1", aIds: ["a1", "a2"], bIds: ["b1", "b2"] },
        { id: "m2", aIds: [], bIds: [] },                      // untouched pairing
        { id: "m3", aIds: ["a5"], bIds: ["b5"] }
      ] },
    { id: "s2", day: "Thursday", format: "fourball", nine: "back", at: 5,
      matches: [
        { id: "m4", aIds: ["a1", "a2"], bIds: ["b1", "b2"] },
        { id: "m5", aIds: [], bIds: [] },
        { id: "m6", aIds: ["a5"], bIds: ["b5"] }
      ] }
  ];

  const sMap = sessionsToMap(sessions);

  // Simulate what actually happens over the wire:
  //  1. RTDB drops empty arrays entirely (no children to persist).
  //  2. RTDB hands keys back in a different order than they were written.
  delete sMap.s1.matches.m2.aIds;
  delete sMap.s1.matches.m2.bIds;
  delete sMap.s2.matches.m5.aIds;
  delete sMap.s2.matches.m5.bIds;

  const val = {
    meta: { v: 2, rosterV: 2, event: "Barn Burner", course: "FarmLinks",
             teams: { a: { name: "Trevor" }, b: { name: "Andrew" } },
             si: [1], par: [4], cfgAt: 5 },
    players: reorder(toMap([{ id: "x", name: "X", ch: 1, at: 1 }]), ["x"]),
    sessions: reorder(sMap, ["s2", "s1"]),                 // session order scrambled
    results: {}, removed: {}
  };
  val.sessions.s1.matches = reorder(val.sessions.s1.matches, ["m3", "m1", "m2"]); // match order scrambled
  val.sessions.s2.matches = reorder(val.sessions.s2.matches, ["m6", "m5", "m4"]);

  const st = firebaseSnapshotToState(val);

  eq("sessions come back in original order despite scrambled keys",
     st.sessions.map(s => s.id), ["s1", "s2"]);
  eq("session s1 matches come back index-ordered (syncDay depends on this)",
     st.sessions[0].matches.map(m => m.id), ["m1", "m2", "m3"]);
  eq("session s2 matches come back index-ordered too",
     st.sessions[1].matches.map(m => m.id), ["m4", "m5", "m6"]);

  eq("untouched pairing on s1 comes back as [] (aIds), not undefined",
     st.sessions[0].matches[1].aIds, []);
  eq("untouched pairing on s1 comes back as [] (bIds), not undefined",
     st.sessions[0].matches[1].bIds, []);
  eq("untouched pairing on s2 comes back as [] too — same slot, mirrored by index",
     st.sessions[1].matches[1].aIds, []);

  eq("a real pairing survived the round trip unscrambled",
     st.sessions[0].matches[0].aIds, ["a1", "a2"]);
  eq("session index by match position lines up across both nines (syncDay's contract)",
     st.sessions[0].matches.map((m, i) => st.sessions[1].matches[i].id),
     ["m4", "m5", "m6"]);
}

console.log("\n=== coerceIds ===");
{
  eq("fills both missing arrays", coerceIds({ id: "m" }), { id: "m", aIds: [], bIds: [] });
  eq("leaves populated arrays alone", coerceIds({ id: "m", aIds: ["x"], bIds: ["y"] }),
     { id: "m", aIds: ["x"], bIds: ["y"] });
}

console.log("\n=== firebaseSnapshotToState guards an empty/seedless root ===");
eq("no meta yet -> null, so the caller keeps its current merged state", firebaseSnapshotToState({}), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
