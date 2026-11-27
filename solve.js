// Fast drop-in for makefun-diff 1.0.0: same patch, same edit script, less work.
// Same rule as the reference: common prefix, then common suffix, then Myers's
// greedy search (furthest x per diagonal, deletion on ties, no edge pruning,
// snake after every step). The search runs on Int32Array V rows instead of
// linked path objects, lines are interned to integer ids so the snakes compare
// ints, and the script is recovered by walking the stored rows back with the
// same choice rule, so the script is the forward pass's own by construction.

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(parts[i] + '\n');
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

// Each distinct line one integer id, shared by both texts, so two lines are
// equal exactly when their ids are equal.
function intern(lines, ids) {
  const out = new Int32Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    let id = ids.get(lines[i]);
    if (id === undefined) { id = ids.size; ids.set(lines[i], id); }
    out[i] = id;
  }
  return out;
}

// Edit runs of A[0..n) into B[0..m): [{kind, count}] in order.
// kind 0 = keep, 1 = delete, 2 = insert.
function myersRuns(A, n, B, m) {
  if (n === 0 && m === 0) return [];
  const Vs = [];
  // d = 0: the snake from the start on diagonal 0.
  let x = 0;
  let y = 0;
  while (x < n && y < m && A[x] === B[y]) { x++; y++; }
  const V0 = new Int32Array(1);
  V0[0] = x;
  Vs.push(V0);
  if (x === n && y === m) return [{ kind: KEEP, count: x }];
  let D = -1;
  let kEnd = 0;
  outer: for (let d = 1; d <= n + m; d++) {
    const Vd = new Int32Array(d + 1);
    const Vp = Vs[d - 1];
    for (let j = 0; j <= d; j++) {
      const k = -d + 2 * j;
      const r = j >= 1 ? Vp[j - 1] : -1;
      const a = j < d ? Vp[j] : -1;
      // A move past either text's end is no candidate (the reference's guards).
      const canR = r !== -1 && r < n;
      const canA = a !== -1 && a - 1 - k < m;
      if (!canR && !canA) { Vd[j] = -1; continue; }
      // Furthest into the old text wins; the deletion wins a tie.
      let xx;
      if (canR && (!canA || r >= a - 1)) xx = r + 1; else xx = a;
      let yy = xx - k;
      while (xx < n && yy < m && A[xx] === B[yy]) { xx++; yy++; }
      Vd[j] = xx;
      if (xx === n && yy === m) { D = d; kEnd = k; Vs.push(Vd); break outer; }
    }
    Vs.push(Vd);
  }
  if (D < 0) throw new Error('makefun-diff: the search ended without reaching both ends');
  // Walk the stored rows back: at (d, k) the move is the same choice the
  // forward pass made from V[d-1], so the script is the forward pass's own.
  const rev = [];
  x = n;
  y = m;
  let k = kEnd;
  for (let d = D; d >= 1; d--) {
    const Vp = Vs[d - 1];
    const j = (k + d) >> 1;
    const r = j >= 1 ? Vp[j - 1] : -1;
    const a = j < d ? Vp[j] : -1;
    const canR = r !== -1 && r < n;
    const canA = a !== -1 && a - 1 - k < m;
    let prevX;
    let snakeStart;
    let kind;
    let kPrev;
    if (canR && (!canA || r >= a - 1)) {
      prevX = r; snakeStart = r + 1; kind = DELETE; kPrev = k - 1;
    } else {
      prevX = a; snakeStart = a; kind = INSERT; kPrev = k + 1;
    }
    const snakeLen = x - snakeStart;
    if (snakeLen > 0) rev.push([KEEP, snakeLen]);
    rev.push([kind, 1]);
    x = prevX;
    y = prevX - kPrev;
    k = kPrev;
  }
  if (x > 0) rev.push([KEEP, x]);
  const runs = [];
  for (let i = rev.length - 1; i >= 0; i--) {
    const seg = rev[i];
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === seg[0]) last.count += seg[1];
    else runs.push({ kind: seg[0], count: seg[1] });
  }
  return runs;
}

// A line as the patch writes it: its op, the line, a newline, and "%" on a
// line of its own when the line had no newline.
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const a = tokenize(input.old);
  const b = tokenize(input.new);
  const n = a.length;
  const m = b.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  // A middle slice that is empty needs no search and no interning: its lines
  // are all deleted, or all of the other slice's lines are inserted.
  const midN = n - prefix - suffix;
  const midM = m - prefix - suffix;
  if (midN === 0 && midM === 0) {
    // Identical texts: nothing between the kept prefix and suffix.
  } else if (midM === 0) {
    runs.push({ kind: DELETE, count: midN });
  } else if (midN === 0) {
    runs.push({ kind: INSERT, count: midM });
  } else {
    const ids = new Map();
    const ai = intern(a, ids);
    const bi = intern(b, ids);
    runs.push(...myersRuns(ai.subarray(prefix, n - suffix), midN, bi.subarray(prefix, m - suffix), midM));
  }
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two
  // kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) { o += r.count; p += r.count; continue; }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) { c.dels += r.count; o += r.count; deleted += r.count; }
    else { c.ins += r.count; p += r.count; inserted += r.count; }
  }

  // The hunks: change runs at most 2 * 3 kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * 3) h.push(c);
    else hunks.push([c]);
  }
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - 3);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(3, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at]));
  }
  return out.join('');
}
