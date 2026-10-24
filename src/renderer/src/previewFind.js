// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Find in the preview (R4.7): the matches of a query in the rendered text of
// the open note, embedded notes included, as DOM Ranges. A match may run
// across inline elements (a word half in bold). Diagrams, embedded PDFs and
// HTML frames are not searched: their text is not the note's own. The caller
// highlights the ranges with the CSS Custom Highlight API, so the preview's
// DOM is never changed.

const SKIP = '.mermaid-diagram, .mermaid-src, iframe, .attachment-embed, script, style, input, button'

// The text nodes under root in document order, with each one's offset in the
// concatenated text; blocks are separated by a newline so that a match never
// joins the end of one paragraph to the start of the next.
function textOf(root) {
  const doc = root.ownerDocument
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? 2 /* FILTER_REJECT */ : 1 /* FILTER_ACCEPT */),
  })
  const parts = []
  let text = ''
  let lastBlock = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, div, summary, dt, dd')
    if (lastBlock && block !== lastBlock) text += '\n'
    lastBlock = block
    parts.push({ node, start: text.length })
    text += node.data
  }
  return { text, parts }
}

// The node and offset at a position in the concatenated text.
function locate(parts, pos, end) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (pos > p.start || (pos === p.start && !end)) {
      return { node: p.node, offset: Math.min(pos - p.start, p.node.data.length) }
    }
  }
  return { node: parts[0].node, offset: 0 }
}

// The matches of query under root, as Ranges in document order; [] for an
// empty query. caseSensitive is false by default.
export function findMatches(root, query, { caseSensitive = false } = {}) {
  if (!query) return []
  const { text, parts } = textOf(root)
  if (!parts.length) return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const doc = root.ownerDocument
  const ranges = []
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
    const a = locate(parts, at, false)
    const b = locate(parts, at + needle.length, true)
    const range = doc.createRange()
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
    ranges.push(range)
  }
  return ranges
}
