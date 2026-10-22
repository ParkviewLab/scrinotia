// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Formatting commands for the source editor: Mod-B, Mod-I, Mod-Shift-C and
// Mod-Shift-H wrap the selection (or the word at the cursor) in **, *, ` or
// ==, and unwrap it when it is already wrapped; Mod-K makes a link; Mod-Enter
// ticks or clears the task box on each selected line, making one where there
// is none (it replaces CodeMirror's insert-a-blank-line for the key).

import { EditorSelection } from '@codemirror/state'

// The length of the run of ch ending just before pos, or starting at pos.
function runBefore(doc, pos, ch) {
  let n = 0
  while (pos - n > 0 && doc.sliceString(pos - n - 1, pos - n) === ch) n++
  return n
}
function runAfter(doc, pos, ch) {
  let n = 0
  while (pos + n < doc.length && doc.sliceString(pos + n, pos + n + 1) === ch) n++
  return n
}

// Whether a run of n marker characters holds the mark: for * (italic) an odd
// run (*x* or ***x***), for ** (bold) a run of two or more, otherwise at least
// the mark's own length.
function holds(mark, n) {
  if (mark === '*') return n % 2 === 1
  return n >= mark.length
}

export function toggleMark(mark) {
  const ch = mark[0]
  return ({ state, dispatch }) => {
    if (state.readOnly) return false
    const len = mark.length
    const tr = state.changeByRange((range) => {
      let { from, to } = range
      if (range.empty) {
        const word = state.wordAt(range.head)
        if (word) ({ from, to } = word)
      }
      const doc = state.doc
      // Marks just outside the range: unwrap.
      if (holds(mark, runBefore(doc, from, ch)) && holds(mark, runAfter(doc, to, ch))) {
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(range.anchor - len, range.head - len),
        }
      }
      // Marks just inside a selection: unwrap.
      const text = doc.sliceString(from, to)
      if (!range.empty && text.length >= 2 * len && text.startsWith(mark) && text.endsWith(mark)) {
        const inner = text.slice(len, -len)
        const innerRun = /^\**/.exec(inner)[0].length
        if (ch !== '*' || holds(mark, len + innerRun)) {
          return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, to - 2 * len) }
        }
      }
      // Otherwise wrap; an empty range with no word gets an empty pair.
      return {
        changes: [
          { from, insert: mark },
          { from: to, insert: mark },
        ],
        range: range.empty ? EditorSelection.cursor(range.head + len) : EditorSelection.range(from + len, to + len),
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }
}

const URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i

// Mod-K: [selection](url) with "url" selected for typing over, or, with a URL
// on the clipboard, [selection](that URL) with the cursor after it. readText
// returns the clipboard's text (a promise, or a string in tests).
export function makeLink(readText) {
  return (view) => {
    if (view.state.readOnly) return false
    Promise.resolve()
      .then(readText)
      .catch(() => '')
      .then((clip) => {
        const url = URL.test(String(clip ?? '').trim()) ? String(clip).trim() : null
        const { state } = view
        const tr = state.changeByRange((range) => {
          let { from, to } = range
          if (range.empty) {
            const word = state.wordAt(range.head)
            if (word) ({ from, to } = word)
          }
          const label = state.sliceDoc(from, to)
          const insert = `[${label}](${url ?? 'url'})`
          const urlFrom = from + label.length + 3
          let sel
          if (url) sel = EditorSelection.cursor(from + insert.length)
          else if (!label) sel = EditorSelection.cursor(from + 1)
          else sel = EditorSelection.range(urlFrom, urlFrom + 3)
          return { changes: { from, to, insert }, range: sel }
        })
        view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
      })
    return true
  }
}

const TASK = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)\[([ xX])\]/
const ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)/

// Mod-Enter: on each selected line, ticks an open task box, clears a ticked
// one, turns a list item into a task, or makes the line a task item.
export function toggleTask({ state, dispatch }) {
  if (state.readOnly) return false
  const changes = []
  let last = -1
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos)
      if (line.number > last) {
        last = line.number
        const task = TASK.exec(line.text)
        const item = ITEM.exec(line.text)
        if (task) {
          const at = line.from + task[1].length + 1
          changes.push({ from: at, to: at + 1, insert: task[2] === ' ' ? 'x' : ' ' })
        } else if (item) {
          changes.push({ from: line.from + item[1].length, insert: '[ ] ' })
        } else {
          changes.push({ from: line.from + /^\s*/.exec(line.text)[0].length, insert: '- [ ] ' })
        }
      }
      pos = line.to + 1
    }
  }
  // A cursor where the box goes ends up after it.
  const set = state.changes(changes)
  dispatch(state.update({ changes: set, selection: state.selection.map(set, 1), scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

export function formatKeymap({ readClipboard }) {
  return [
    { key: 'Mod-b', run: toggleMark('**') },
    { key: 'Mod-i', run: toggleMark('*') },
    { key: 'Mod-Shift-c', run: toggleMark('`') },
    { key: 'Mod-Shift-h', run: toggleMark('==') },
    { key: 'Mod-k', run: makeLink(readClipboard) },
    { key: 'Mod-Enter', run: toggleTask },
  ]
}
