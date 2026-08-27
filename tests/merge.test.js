// Per-entity config merge. Pulls the real functions out of pursell-cup.html so
// this tests the shipped code rather than a copy that can drift from it.
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
const names = ["stamp", "byId", "newer", "stampMissing", "mergeResults", "mergeState"];
const sandbox = {};
new Function(names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};")
  .call(sandbox)
  && Object.assign(sandbox, new Function(
      names.map(extract).join("\n") + "\nreturn {" + names.join(",") + "};")());
const { stampMissing, mergeState, newer } = sandbox;

let pass = 0, fail = 0;
const eq = (l, g, w) => {
  const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a === b) { pass++; console.log(`  ok   ${l}`); }
  else { fail++; console.log(`  FAIL ${l}\n       got  ${a}\n       want ${b}`); }
};

const T0 = 1000, T1 = 2000, T2 = 3000;
const mk = (players, sessions, extra) => Object.assign(
  { cfgAt: T0, players, sessions: sessions || [], results: {}, removed: {} }, extra || {});
const P = (id, name, ch, at, team) => ({ id, name, ch, team: team || "a", at });
const chOf = (st, name) => (st.players.find(p => p.name === name) || {}).ch;

console.log("\n=== the bug that started this: stale phone vs newer edit ===");
{
  // Board was clobbered by a stale phone: Chris back to 2, stamped old.
  const board = mk([P("c", "Chris", 2, T0)], [], { cfgAt: T0 });
  // Captain's phone holds the newer correction.
  const phone = mk([P("c", "Chris", 5, T1)], [], { cfgAt: T1 });
  eq("newer edit wins regardless of which side it is on", chOf(mergeState(board, phone), "Chris"), 5);
  eq("and wins with the arguments swapped", chOf(mergeState(phone, board), "Chris"), 5);
}
{
  // A stale phone posting cannot permanently undo it: once the captain's
  // phone loads again, its newer stamp reasserts.
  const clobbered = mk([P("c", "Chris", 2, T0)], [], { cfgAt: T2 }); // newer cfgAt, older entity
  const captain   = mk([P("c", "Chris", 5, T1)], [], { cfgAt: T1 });
  eq("a newer cfgAt does NOT drag a stale entity along", chOf(mergeState(clobbered, captain), "Chris"), 5);
}

console.log("\n=== concurrent edits to different players both survive ===");
{
  const a = mk([P("x", "Taki", 32, T1), P("y", "Bobby", 12, T0)]);
  const b = mk([P("x", "Taki", 32, T0), P("y", "Bobby", 9,  T1)]);
  const m = mergeState(a, b);
  eq("Taki keeps A's value",  chOf(m, "Taki"), 32);
  eq("Bobby keeps B's value", chOf(m, "Bobby"), 9);
  eq("nobody is lost", m.players.length, 2);
}

console.log("\n=== removals ===");
{
  const board = mk([P("x", "Taki", 32, T0), P("y", "Bobby", 12, T0)]);
  const phone = mk([P("x", "Taki", 32, T0)], [], { removed: { y: T1 } });
  const m = mergeState(board, phone);
  eq("removed player does not come back", m.players.map(p => p.name), ["Taki"]);
  eq("tombstone is carried forward", m.removed.y, T1);
}
{
  // Removed, then someone edits that same player later: the edit wins.
  const board = mk([P("y", "Bobby", 15, T2)]);
  const phone = mk([], [], { removed: { y: T1 } });
  eq("an edit newer than the removal revives the player",
     mergeState(board, phone).players.map(p => p.name), ["Bobby"]);
}

console.log("\n=== pairings merge per match ===");
{
  const sess = (m1, m2) => [{ id: "s1", day: "Thursday", format: "scramble", nine: "front", at: T0,
                              matches: [m1, m2] }];
  const a = mk([], sess({ id: "m1", aIds: ["p1"], bIds: [], at: T1 },
                        { id: "m2", aIds: [],     bIds: [], at: T0 }));
  const b = mk([], sess({ id: "m1", aIds: [],     bIds: [], at: T0 },
                        { id: "m2", aIds: ["p9"], bIds: [], at: T1 }));
  const m = mergeState(a, b).sessions[0].matches;
  eq("match 1 takes A's newer pairing", m[0].aIds, ["p1"]);
  eq("match 2 takes B's newer pairing", m[1].aIds, ["p9"]);
}

console.log("\n=== scores still merge per match, unchanged ===");
{
  const a = mk([], [], { results: { m1: { holes: { 1: "A" }, updatedAt: T1 } } });
  const b = mk([], [], { results: { m2: { holes: { 3: "B" }, updatedAt: T1 },
                                    m1: { holes: {},        updatedAt: T0 } } });
  const r = mergeState(a, b).results;
  eq("newer match record wins",      r.m1.holes, { 1: "A" });
  eq("other group's match survives", r.m2.holes, { 3: "B" });
}

console.log("\n=== stampMissing backfills legacy state ===");
{
  const legacy = { cfgAt: T1, players: [{ id: "a", name: "X", ch: 4 }],
                   sessions: [{ id: "s", day: "Thursday", matches: [{ id: "m", aIds: [], bIds: [] }] }] };
  const s = stampMissing(legacy);
  eq("player inherits cfgAt",  s.players[0].at, T1);
  eq("session inherits cfgAt", s.sessions[0].at, T1);
  eq("match inherits cfgAt",   s.sessions[0].matches[0].at, T1);
  eq("removed map created",    s.removed, {});
}

console.log("\n=== roster order is stable across a merge ===");
{
  const order = ["Adam", "Bobby", "Chris"];
  const a = mk(order.map((n, i) => P("p" + i, n, 10, T0)));
  const b = mk(order.map((n, i) => P("p" + i, n, 11, T1)).reverse(), [], { cfgAt: T0 });
  eq("follows the newer side's ordering, not the merge order",
     mergeState(a, b).players.map(p => p.name), order);
}

console.log("\n=== newer() edge cases ===");
eq("missing left",  newer(null, { at: 1 }), { at: 1 });
eq("missing right", newer({ at: 1 }, null), { at: 1 });
eq("tie prefers the first (board) for stability", newer({ at: 5, s: "a" }, { at: 5, s: "b" }), { at: 5, s: "a" });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
