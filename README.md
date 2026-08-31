# Pursell Cup

Live match-play scoreboard for the **2026 Manor / FarmLinks Barn Burner** — a 20-man,
three-day Ryder Cup at FarmLinks at Pursell Farms, Sylacauga, Alabama.

Single self-contained HTML file. No build step, no dependencies, no framework.

**Live board:** https://claude.ai/code/artifact/98941b42-dc27-4519-9417-8a3a35db2837

> **Status: the event is over and the app is locked.**
> `LOCKED = true` near the top of the script freezes it into a read-only
> record: no Setup tab, no hole entry, no posting, and `pickDriver()` returns
> `"local"` so no sync driver runs at all. The board renders entirely from the
> state embedded in the file, so it needs neither Firebase nor the artifact
> publish path. The final result is also archived in `archive/`.
> Set `LOCKED = false` to reopen it for another event.

---

## Read this before changing anything

The three gotchas below are about the **artifact publish path** — the fallback
used when `FIREBASE` (near the top of the `<script>` in `pursell-cup.html`) is
blank. Once a real Firebase project is configured there, the app runs in
`"firebase"` mode instead: every phone syncs live off the Realtime Database and
none of this applies. See **Sync model** for how driver selection works and
what changes between modes. They're not obvious from the code, so read them
before touching the artifact fallback.

### 1. The published artifact holds the live scores. This repo does not.

`pursell-cup.html` ships with a placeholder state block:

```html
<script id="app-state" type="application/json">{"v":1}</script>
```

The **published** page has real scores in that block, written there by scorers
tapping "Post to the board" during play. Publishing this repo's copy over the live
artifact **erases every score posted so far.**

Correct procedure for any mid-event change:

1. Read the live artifact (`action: "read"` on the URL) to get the current HTML.
2. Extract the real `#app-state` payload from it.
3. Apply your code change to `pursell-cup.html`.
4. Splice the live state back into the `#app-state` block.
5. Republish, passing the artifact URL so it updates in place.

Between events, when no scores matter, skip all that and publish directly.

### 2. Republishing does not reach viewers on its own.

Viewers are pinned to the version that was current when the link was shared. After
any republish, the owner has to **move the share pin** from the artifact's share menu
or everyone keeps seeing the old build. Nothing in the code can do this.

### 3. The page rebuilds itself from its own source.

`SHELL` is captured at script start, before any render, and is what gets republished
when someone posts. The host injects a versioned runtime block plus a `<base href>`
into `<head>` at serve time; both are stripped from `SHELL` before republishing.
Remove that strip and every post bakes in a stale asset path and stacks another
copy of the runtime.

---

## The event

Six nine-hole sessions, 40 points, 20½ to win. All 20 players in every session.

| Session | Format | Nine | Handicap allowance | Matches | Pts |
|---|---|---|---|---|---|
| Thu Front 9 | Scramble | Front | 35% low + 15% high | 5 | 5 |
| Thu Back 9 | Best Ball | Back | 100% | 5 | 5 |
| Fri Front 9 | Shamble | Front | 75% | 5 | 5 |
| Fri Back 9 | Modified Alt Shot | Back | 60% low + 40% high | 5 | 5 |
| Sat Front 9 | Singles | Front | 100% of the difference | 10 | 10 |
| Sat Back 9 | Singles | Back | 100% of the difference | 10 | 10 |

Best ball at 100% and shamble at 75% are the organizer's house rules, chosen over the
USGA's 90% four-ball allowance. Deliberate — don't "fix" them.

**Pairings are per day on Thursday and Friday** — a group plays both nines together, so
editing a pairing on one nine mirrors it by match index onto the other (`syncDay`). Match
IDs stay distinct per session so the two nines keep separate scorecards.

**Saturday is different: the singles switch opponents at the turn.** Days named in
`INDEPENDENT_DAYS` do not mirror — each nine holds its own draw, `syncDay()` and
`normalizeDays()` skip them, Setup shows a separate pairing editor per nine, and Shuffle
draws each nine on its own so nobody meets the same opponent twice. Mirroring a day like
this would silently overwrite the back nine with the front, and because the two draws are
different, a player's stroke allocation is not the same on both nines either.
`tests/pairings.test.js` covers both behaviours.

## The golf math

`allocation(match, session)` returns one of two shapes:

- **`kind: "side"`** — scramble, modified alt shot, singles. One team receives N strokes.
  Team value is `lo × lowHandicap + hi × highHandicap` (singles just uses the one player).
  Strokes given = rounded difference between the two team values.
- **`kind: "player"`** — best ball, shamble. Every player gets
  `courseHandicap × allowance`, then all four are reduced by the lowest so the low man
  plays scratch. Net best ball per side decides the hole.

**Course handicaps are halved first** — these are nine-hole matches. Singles keep
the half rather than rounding it away: see **Half strokes in singles** below.

**Stroke index is ranked within the nine being played, not taken raw from the 18-hole
card.** This is the easy thing to get wrong. On the front, hole 4 (SI 1) is stroke #1 and
hole 6 (SI 17) is #9. On the back, hole 12 (SI 2) is #1 and hole 13 (SI 18) is #9. A
player with 5 shots on the back gets them on the five hardest *back-nine* holes. Taking
`SI <= 5` off the 18-hole card would give him one. See `ranksOf()`.

Course data (FarmLinks), par 72:

```
Hole   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
Par    5  4  4  4  3  5  4  3  4  5  4  4  4  4  3  4  3  5
SI    15  9 13  1  7 17 11  5  3 14  6  2 18  4 10 12 16  8
```

Read the SI off the **men's** HANDICAP row — the one directly under the Longhorn /
Copperhead / Whitetail / Bobcat yardages. All four men's tees share it, so the roster's
mix of Whitetail and Bobcat players doesn't change it. The card carries a *second*
HANDICAP row lower down, under the QUAIL yardages; those are the forward-tee indexes
and they differ (17 and 18 read 14 and 6 there, against 16 and 8 on the men's row).
Copying that row in by mistake is a live bug, not a rounding detail.

### Half strokes in singles

Rounding the halved difference to a whole number sent a half-stroke **up on both
nines**, so every odd course-handicap difference gained a stroke across the day: a 12
gave a 13 two shots where eighteen holes of golf gives one. That distorted half of every
possible pairing, always in the higher handicap's favour.

Course handicaps are whole numbers, so half of one is always a multiple of 0.5 — the
difference needs no rounding at all. `allocation()` keeps it for any format whose
allowance is `diff` (singles), and rounds to a whole stroke everywhere else, because the
weighted team formats land on arbitrary fractions rather than clean halves.

A 12 against a 13 is now **half a stroke**, not a whole one. Each Saturday nine is a
separate match against a different opponent, so the allocation is computed fresh per nine
rather than being a share of some eighteen-hole total. `strokesOnHole()` spreads the whole
strokes hardest-hole-first as always and drops any trailing half on the hardest hole not
already picking up an extra whole one, so 1½ is a full stroke on the toughest hole and a
half on the next.

A half stroke **only breaks a tie**. Level gross on that hole wins it for the man
receiving; it will not overturn a hole he loses outright. `strokeText()` renders these
as "½" and "1½" rather than decimals, which is easier to read on a phone in sunlight.

Only Saturday is singles, so no completed Thursday or Friday result moves.
`tests/halfstroke.test.js` covers both rules side by side.

## Sync model

Local-first, always. Every tap writes to `localStorage` immediately — works with no
signal, which matters on the back side of the property. A driver is picked once at
boot (`pickDriver()`) and shown on the header's sync line:

- **`"firebase"`** — `FIREBASE.databaseURL` is filled in and the compat SDK loaded.
  Any phone with the link can score, no publish/share-pin step required. Every hole
  tap writes straight to `ROOT/results/<matchId>`; config edits (roster, pairings,
  stroke index, team names) are debounced ~900ms and pushed to
  `ROOT/{meta,players,sessions,removed}`. The app subscribes to `ROOT` with
  `.on("value")` and feeds every snapshot through the same `mergeState()` used by the
  artifact path — per-match and per-entity merge logic doesn't change based on driver.
  The Post button is hidden; there's nothing to post.
- **`"artifact"`** — no Firebase configured, but the artifact runtime is present. Falls
  back to the original `artifact.publish()` flow described below. If a publish ever
  comes back `not_writer` (a shared, view-only artifact link), the app drops to
  `"local"` on the spot and says so — that viewer can never write here, so retrying
  is pointless.
- **`"local"`** — neither is available. Everything stays on this phone.

### The RTDB ordering trap

Realtime Database stores `players`/`sessions`/`matches` as `{id: value}` maps, not
arrays — needed so a config push doesn't clobber a sibling's edit — and hands back
object keys in **whatever order the server feels like**, not insertion order. But
`syncDay()` mirrors pairings **by match index**: match 2 on the front nine has to line
up with match 2 on the back nine. Losing array order silently scrambles every pairing
onto the wrong slot.

So every player, session and match carries an explicit `ord` (its position in the
array) on the way out (`toMap`/`sessionsToMap`), and gets re-sorted by `ord` on the way
back in (`fromMap`). RTDB also treats an empty array as "no children" and drops it
entirely, so `aIds`/`bIds` come back `undefined`, not `[]`, on a pairing nobody's set
yet — `coerceIds()` puts the empty array back. `tests/firebase.test.js` round-trips
state through deliberately key-reversed maps and asserts both hold.

A brand-new phone that has never seen this event (no artifact-embedded state, no
`localStorage`) boots into `freshState()`, stamped "now". Its first firebase snapshot
must **replace** that state outright rather than merge with it — a per-entity merge
would let the synthetic "now" stamps wrongly outrank the real (older) data on the
board. See the `freshBoot` flag in `boot()`/`subscribeFirebase()`.

### The artifact fallback

"Post to the board" calls `artifact.publish()` with the full document and the current
state embedded. **State merges per match on `updatedAt`**, so posting your group's match
never clobbers another group's, even from a stale copy. On `conflict` the view reloads
to the winner and the scorer taps Post again; nothing is lost because it's still on their
phone.

`migrateRoster()` patches cached handicaps by name when `ROSTER_V` is bumped, without
disturbing pairings or scores. Bump it whenever a handicap in `ROSTER` changes.

### Course data is state, not a constant

Allocation reads `S.si` and `S.par`, **not** the `SI`/`PAR` constants. Those constants
seed `freshState()` and nothing else — the arrays then live in each phone's
`localStorage` and in `ROOT/meta`, and Setup lets a scorer edit the stroke index by
hand. So correcting `SI` in the source reaches nobody who has already loaded the board.

Bump `COURSE_V` whenever `SI` or `PAR` changes. `migrateCourse()` overwrites the stored
arrays from the constants, stamps `cfgAt` so the correction propagates through the
normal config push, and leaves phones already on that version alone so manual SI edits
survive. `mergeState()` picks `si`/`par` from whichever side has the **higher
`courseV`**, falling back to `cfgAt` only when both agree — otherwise a phone still on
the old card but holding a newer `cfgAt` (someone renamed a team on it) would push the
stale stroke index straight back out.

This bit us live: holes 17 and 18 shipped transposed against the FarmLinks card, and
fixing the constant alone changed nothing on the course, because every phone and the
Firebase record still held the old array. `tests/course.test.js` covers the migration
and both merge directions.

### Correcting the card mid-event

Allocation is derived at render, never frozen into a result — so correcting the stroke
index re-decides finished holes for anyone holding 4–7 strokes, days after they were
played. That is almost never what you want once play has started.

`ranksOf()` therefore reads `siOf(session)`, not `S.si` directly. A session pinned to its
own `si` keeps resolving under the card it was played on; everything else follows the
live one. `SI_PLAYED` holds the superseded card and `SI_PLAYED_SESSIONS` names the
sessions that stay on it — Thursday alone for the 17/18 correction, with Friday and
Saturday moving to the corrected index.

Two details worth keeping if you touch this:

- **Pinned sessions are named by id, not inferred from "has scores".** `migrateCourse()`
  can run at boot before the first Firebase snapshot lands; a phone reading an empty
  board would infer that nothing had been played and pin nothing.
- **`siOf()` falls back to the constant, not just the stored pin.** Sessions merge
  per-entity by stamp, so a phone on an older build can republish `s2` with no pin and
  strip one that was set. The constant makes a played session resolve identically on any
  phone running the current build, synced or not.

## Deploying with Firebase

1. Create a Realtime Database project, then fill in `FIREBASE` near the top of the
   `<script>` in `pursell-cup.html` (`apiKey`, `databaseURL`, etc.) and pick a `ROOT`.
2. Deploy `database.rules.json` to that project. It's world-readable and world-writable
   through **2026-09-14**, then flips to read-only — adjust the cutoff timestamp for a
   different event window.
3. `vercel.json` rewrites `/` to `pursell-cup.html` with `Cache-Control: no-store`, so a
   redeploy reaches phones immediately instead of waiting out a cache. `.vercelignore`
   keeps `tests/`, `tools/` and `archive/` out of the deployed bundle.

Once `FIREBASE.databaseURL` is set, every phone that loads the page syncs live — no
artifact share pin, no "Post" step, no owner needed to relay changes.

## Tests

No framework. Plain Node, no install.

```
node tests/engine.test.js      # 34 checks: allocation, stroke spreading, closeouts
node tests/daysync.test.js     # 11 checks: per-day pairing mirror
node tests/merge.test.js       # 21 checks: per-entity config merge (artifact + firebase share this)
node tests/firebase.test.js    # 15 checks: RTDB key-order + empty-array round trip
node tests/course.test.js      # 35 checks: stroke-index migration, per-session pinning
node tests/shotgun.test.js     # 41 checks: shotgun starts, play order, start-hole sync
node tests/halfstroke.test.js  # 66 checks: half strokes in singles, tie-breaking, display
node tests/pairings.test.js    # 18 checks: which days mirror their pairings, which do not
node tools/rostercheck.js      # handicap spread analysis, not a test
```

`rostercheck.js` reports team balance and the stroke gaps each format produces. Re-run it
if handicaps change — it's how the 15-shot ceiling in Saturday singles got caught.

## Layout

```
pursell-cup.html            the entire app
tests/engine.test.js        golf math
tests/daysync.test.js       pairing mirror
tests/merge.test.js         per-entity config merge
tests/firebase.test.js      RTDB ordering + empty-array round trip
tests/course.test.js        stroke-index migration, per-session pinning
tests/shotgun.test.js       shotgun starts and play order
tests/halfstroke.test.js    half strokes in singles
tests/pairings.test.js      per-day mirroring vs independent nines
tools/rostercheck.js        handicap analysis
vercel.json                 rewrite / to pursell-cup.html, no-store
.vercelignore                keeps tests/tools/archive out of the deploy
database.rules.json         world read, timed write window, then read-only
archive/ryder-cup-live.jsx  original React draft, superseded
```
