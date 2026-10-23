// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Source lines for the preview's blocks (item 13). marked's lexer keeps each
// token's source text as `raw`, and the top-level raws follow one another
// through the note's body, so a token's first line is the body's first line
// plus the line breaks of the tokens before it. A list's items, and the
// lists nested in them, are counted the same way inside the list. The
// editor and the preview are then matched by line: each stamped block is an
// anchor (a line and a height in the preview), and a position between two
// anchors is interpolated.

const breaks = (s) => (s.match(/\n/g) ?? []).length

// The first line of each token, the first starting at `first` (1-based).
export function tokenLines(tokens, first = 1) {
  let line = first
  return tokens.map((t) => {
    const at = line
    line += breaks(t.raw ?? '')
    return at
  })
}

// The first line of each item of a list token that starts at `first`, with
// the same for the lists nested in each item:
// [{ line, lists: [[{ line, lists }, …], …] }, …].
export function listItemLines(list, first) {
  const starts = tokenLines(list.items, first)
  return list.items.map((item, i) => {
    // An item's tokens are its text without the marker, so their line breaks
    // count from the item's own first line.
    const inner = tokenLines(item.tokens ?? [], starts[i])
    const lists = (item.tokens ?? []).flatMap((t, k) => (t.type === 'list' ? [listItemLines(t, inner[k])] : []))
    return { line: starts[i], lists }
  })
}

// Anchors in increasing order of line and height; one that would run
// backwards (a block moved by the HTML parser, or one without geometry) is
// left out, as is a line that repeats.
export function orderedAnchors(anchors) {
  const out = []
  for (const a of anchors) {
    const last = out[out.length - 1]
    if (last && (a.line <= last.line || a.top < last.top)) continue
    out.push(a)
  }
  return out
}

// The height for a (fractional) line, interpolated between the anchors
// around it; before the first anchor and after the last, the nearest one.
export function topForLine(anchors, line) {
  if (!anchors.length) return 0
  if (line <= anchors[0].line) return anchors[0].top
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]
    const b = anchors[i]
    if (line < b.line) return a.top + ((line - a.line) / (b.line - a.line)) * (b.top - a.top)
  }
  return anchors[anchors.length - 1].top
}

// The (fractional) line at a height: the inverse of topForLine.
export function lineForTop(anchors, top) {
  if (!anchors.length) return 1
  if (top <= anchors[0].top) return anchors[0].line
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]
    const b = anchors[i]
    if (top < b.top) return b.top > a.top ? a.line + ((top - a.top) / (b.top - a.top)) * (b.line - a.line) : a.line
  }
  return anchors[anchors.length - 1].line
}

// Item 14: of the blocks drawn before (`was`, their keys in order) and the
// blocks of the note now (`now`), how many at the start (`head`) and at the
// end (`tail`) are the same and can be kept; the blocks between are
// redrawn. A missing key never matches.
export function keptEnds(was, now) {
  const same = (a, b) => a !== undefined && a === b
  let head = 0
  while (head < was.length && head < now.length && same(was[head], now[head])) head++
  let tail = 0
  while (tail < was.length - head && tail < now.length - head && same(was[was.length - 1 - tail], now[now.length - 1 - tail])) tail++
  return { head, tail }
}
