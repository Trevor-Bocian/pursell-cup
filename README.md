# Pursell Cup

Live match-play scoreboard for the **2026 Manor / FarmLinks Barn Burner** — a 20-man,
three-day Ryder Cup at FarmLinks at Pursell Farms, Sylacauga, Alabama.

Single self-contained HTML file. No build step, no dependencies, no framework.

**Live board:** https://claude.ai/code/artifact/98941b42-dc27-4519-9417-8a3a35db2837

---

## Read this before changing anything

Three things will bite you. They are not obvious from the code.

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

**Pairings are per day, not per session.** A group plays both nines together. Editing a
pairing on one nine mirrors it by match index onto the other (`syncDay`). Match IDs stay
distinct per session so the two nines keep separate scorecards.

## The golf math

`allocation(match, session)` returns one of two shapes:

- **`kind: "side"`** — scramble, modified alt shot, singles. One team receives N strokes.
  Team value is `lo × lowHandicap + hi × highHandicap` (singles just uses the one player).
  Strokes given = rounded difference between the two team values.
- **`kind: "player"`** — best ball, shamble. Every player gets
  `courseHandicap × allowance`, then all four are reduced by the lowest so the low man
  plays scratch. Net best ball per side decides the hole.

**Course handicaps are halved first** — these are nine-hole matches.

**Stroke index is ranked within the nine being played, not taken raw from the 18-hole
card.** This is the easy thing to get wrong. On the front, hole 4 (SI 1) is stroke #1 and
hole 6 (SI 17) is #9. On the back, hole 12 (SI 2) is #1 and hole 13 (SI 18) is #9. A
player with 5 shots on the back gets them on the five hardest *back-nine* holes. Taking
`SI <= 5` off the 18-hole card would give him one. See `ranksOf()`.

Course data (FarmLinks, Longhorn tees), par 72:

```
Hole   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
Par    5  4  4  4  3  5  4  3  4  5  4  4  4  4  3  4  3  5
SI    15  9 13  1  7 17 11  5  3 14  6  2 18  4 10 12  8 16
```

## Sync model

Local-first. Every tap writes to `localStorage` immediately — works with no signal,
which matters on the back side of the property.

"Post to the board" calls `artifact.publish()` with the full document and the current
state embedded. **State merges per match on `updatedAt`**, so posting your group's match
never clobbers another group's, even from a stale copy. On `conflict` the view reloads
to the winner and the scorer taps Post again; nothing is lost because it's still on their
phone.

`migrateRoster()` patches cached handicaps by name when `ROSTER_V` is bumped, without
disturbing pairings or scores. Bump it whenever a handicap in `ROSTER` changes.

## Tests

No framework. Plain Node, no install.

```
node tests/engine.test.js      # 32 checks: allocation, stroke spreading, closeouts
node tests/daysync.test.js     # 11 checks: per-day pairing mirror
node tools/rostercheck.js      # handicap spread analysis, not a test
```

`rostercheck.js` reports team balance and the stroke gaps each format produces. Re-run it
if handicaps change — it's how the 15-shot ceiling in Saturday singles got caught.

## Layout

```
pursell-cup.html          the entire app
tests/engine.test.js      golf math
tests/daysync.test.js     pairing mirror
tools/rostercheck.js      handicap analysis
archive/ryder-cup-live.jsx  original React draft, superseded
```
