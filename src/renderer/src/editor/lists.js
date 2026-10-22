// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// List-aware indentation (R3.5). On a list item, Tab and Mod-] nest the item
// under the one above (at that item's content column: two for "- ", three for
// "1. ", four for "10. "), and Shift-Tab and Mod-[ move it out to its
// parent's column; the item's own sub-items move with it, and ordered lists
// are renumbered after either. Off a list item the commands return false, so
// the keys keep their usual meaning.

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

const ITEM = /^( *)([-*+]|(\d{1,9})([.)]))( +|$)/

// A line's list item, or null: its indent, the marker's parts, and the content
// column (CommonMark: after the marker and its spaces, or one space when
// there are five or more).
export function parseItem(text) {
  const m = ITEM.exec(text)
  if (!m) return null
  const indent = m[1].length
  const marker = m[2]
  const spaces = m[5].length === 0 || m[5].length > 4 ? 1 : m[5].length
  return { indent, marker, number: m[3] ? Number(m[3]) : null, delim: m[4] ?? null, content: indent + marker.length + spaces }
}

const indentOf = (text) => /^ */.exec(text)[0].length
const blank = (text) => !text.trim()

// Whether the line starts a Markdown list item in the syntax tree: not a
// "- " in a code block or the frontmatter, nor an item inside a block quote
// (whose markers the column arithmetic here does not handle).
function startsItem(state, line) {
  const at = line.from + indentOf(line.text)
  const tree = ensureSyntaxTree(state, line.to, 50) ?? syntaxTree(state)
  let item = null
  for (let node = tree.resolveInner(at, 1); node; node = node.parent) {
    if (node.name === 'Blockquote') return false
    if (node.name === 'ListItem' && node.from === at) item = node
  }
  return item !== null
}

// The lines of the list around a line, as [first, last] line numbers: items,
// lines indented under them and blank lines between them, up to a line at
// the margin that is not an item.
function listBlock(doc, n) {
  const inList = (k) => {
    const text = doc.line(k).text
    return blank(text) || parseItem(text) !== null || indentOf(text) > 0
  }
  let first = n
  while (first > 1 && inList(first - 1)) first--
  let last = n
  while (last < doc.lines && inList(last + 1)) last++
  return [first, last]
}

// The changes that renumber every ordered list in lines [first, last], given
// each line's text after indentation (texts) and its position in the
// document as it is (from, the indent the line has there). A list keeps the
// number it starts at, unless its first item is a selected one that moved (moved[k]),
// which starts a new list at 1.
function renumber(texts, starts, moved) {
  const changes = []
  const stack = []
  texts.forEach((text, k) => {
    if (blank(text)) return
    const item = parseItem(text)
    if (!item) {
      const indent = indentOf(text)
      while (stack.length && stack.at(-1).indent >= indent) stack.pop()
      return
    }
    while (stack.length && stack.at(-1).indent > item.indent) stack.pop()
    const top = stack.at(-1)
    const ordered = item.number !== null
    if (top && top.indent === item.indent && top.ordered === ordered) {
      if (ordered && item.number !== top.next) {
        const from = starts[k].from + starts[k].indent
        changes.push({ from, to: from + String(item.number).length, insert: String(top.next) })
      }
      top.next++
    } else {
      if (top && top.indent === item.indent) stack.pop()
      let start = item.number ?? 0
      if (ordered && moved[k] && start !== 1) {
        const from = starts[k].from + starts[k].indent
        changes.push({ from, to: from + String(start).length, insert: '1' })
        start = 1
      }
      stack.push({ indent: item.indent, ordered, next: start + 1 })
    }
  })
  return changes
}

// The indent the item on line n moves to, or null when it cannot move.
function targetIndent(doc, n, item, dir) {
  for (let k = n - 1; k >= 1; k--) {
    const text = doc.line(k).text
    if (blank(text)) continue
    const above = parseItem(text)
    if (!above) {
      if (indentOf(text) === 0) return null
      continue
    }
    if (dir > 0 && above.indent <= item.indent) return above.content > item.indent ? above.content : null
    if (dir < 0 && above.indent < item.indent) return above.indent
  }
  return dir < 0 && item.indent > 0 ? 0 : null
}

function shiftList(dir) {
  return ({ state, dispatch }) => {
    const { doc } = state
    const sel = state.selection.main
    const firstLine = doc.lineAt(sel.from)
    const item = parseItem(firstLine.text)
    if (!item || firstLine.text.slice(0, item.indent).includes('\t') || !startsItem(state, firstLine)) return false
    const to = targetIndent(doc, firstLine.number, item, dir)
    if (to === null) return true // a list item that cannot move: the key does nothing
    const delta = to - item.indent

    // The lines that move: the selected ones and the sub-items of the last.
    const lastSelected = doc.lineAt(Math.max(sel.from, sel.to - (sel.empty ? 0 : 1))).number
    const lastIndent = indentOf(doc.line(lastSelected).text)
    let end = lastSelected
    for (let k = lastSelected + 1; k <= doc.lines; k++) {
      const text = doc.line(k).text
      if (blank(text)) continue
      if (indentOf(text) <= lastIndent) break
      end = k
    }

    const [first, last] = listBlock(doc, firstLine.number)
    const changes = []
    const texts = []
    const starts = []
    const moved = []
    for (let k = first; k <= last; k++) {
      const line = doc.line(k)
      const indent = indentOf(line.text)
      let text = line.text
      if (k >= firstLine.number && k <= end && !blank(text)) {
        const by = Math.max(delta, -indent)
        if (by > 0) changes.push({ from: line.from, insert: ' '.repeat(by) })
        if (by < 0) changes.push({ from: line.from, to: line.from - by })
        text = ' '.repeat(indent + by) + text.slice(indent)
      }
      texts.push(text)
      starts.push({ from: line.from, indent })
      moved.push(k >= firstLine.number && k <= lastSelected)
    }
    changes.push(...renumber(texts, starts, moved))
    dispatch(state.update({ changes, scrollIntoView: true, userEvent: dir > 0 ? 'input.indent' : 'delete.dedent' }))
    return true
  }
}

export const indentListItem = shiftList(1)
export const outdentListItem = shiftList(-1)

export const listKeymap = [
  { key: 'Tab', run: indentListItem },
  { key: 'Shift-Tab', run: outdentListItem },
  { key: 'Mod-]', run: indentListItem },
  { key: 'Mod-[', run: outdentListItem },
]
