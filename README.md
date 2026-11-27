# makefun-diff — a faster drop-in for makefun-diff 1.0.0

[![make.fun](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/c/diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/toirant/diff-speed-01-run-20261126/rank.svg)](https://make.fun/c/diff-speed-01-run-20261126/leaderboard)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/toirant/diff-speed-01-run-20261126/reward.svg)](https://make.fun/c/diff-speed-01-run-20261126)

A faster drop-in for make.fun's own `makefun-diff` 1.0.0, written for the
[make.fun diff-speed-01-run-20261126 bounty](https://make.fun/bounty/diff-speed-01-run-20261126)
($100, 1st–10th place $10 each). `solve.js` answers every case exactly as
`makefun-diff` 1.0.0 does — the same patch, the same edit script — in about a
third of the CPU time.

## How it works

`run(input)` returns make.fun's own patch of `{ old, new }` as one JSON string:
lines are cut after every `\n`, the common prefix and then the common suffix
are kept, and between them Myers's greedy search runs with make.fun's exact
rule — furthest into the old text on each diagonal, the deletion winning a
tie, no move past either text's end, no edge-diagonal pruning, a snake after
every step. The patch shows up to 3 kept lines around each change run, with
runs at most 6 kept lines apart sharing a hunk.

The speed comes from doing the same search with less work, not from a
different search:

- **Lines are interned to integer ids** (one `Map`, shared by both texts), so
  the snakes compare ints instead of strings.
- **The search runs on `Int32Array` V rows** instead of the reference's linked
  path objects, so the O(D²) triangle allocates almost nothing.
- **The script is recovered by walking the stored V rows back**, applying the
  same choice rule the forward pass used at each `(d, k)`, so the script it
  recovers is the forward pass's own script by construction.

Nothing is cached between cases, there are no dependencies, and the entry is
one small ES module (`solve.js`, ~7 KB) plus the harness driver (`main.ts`).

## Layout

- `solve.js` — the entry: `run(input)` returns the patch string.
- `main.ts` — the driver the harness runs: reads `/input/cases.json`, answers
  each case with `run`, writes `/output/answers.json`.
- `package.json` — `{"type": "module"}` so `solve.js` loads as an ES module.

## Check it

With the bounty kit unpacked as the working directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repository> --driver docker
```

On the kit's practice set the entry matches the reference on all 4 cases and
runs in about a third of the reference's CPU time (measured locally, same
machine, same cases).
