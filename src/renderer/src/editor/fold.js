// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Folding in the source editor, on the ranges lang-markdown defines (sections,
// lists, tables) and the frontmatter: Mod-Alt-[ folds at the cursor, Mod-Alt-]
// unfolds, Mod-Alt-. folds every section or, with any fold open, unfolds all.
// Without a gutter, a marker at the end of the cursor's line shows that it
// folds, and a click on it folds or unfolds.

import { StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import {
  codeFolding,
  foldAll,
  foldCode,
  foldable,
  foldedRanges,
  foldEffect,
  foldService,
  syntaxTree,
  unfoldAll,
  unfoldCode,
  unfoldEffect,
} from '@codemirror/language'

// The frontmatter folds to its first line.
const frontmatterFold = foldService.of((state, from, to) => {
  if (from !== 0) return null
  const node = syntaxTree(state).topNode.firstChild
  if (node?.name !== 'Frontmatter' || node.to <= to) return null
  return { from: to, to: node.to }
})

function foldedAt(state, line) {
  let found = null
  foldedRanges(state).between(line.to, line.to + 1, (from, to) => {
    if (from === line.to) found = { from, to }
  })
  return found
}

class FoldMarker extends WidgetType {
  constructor(folded) {
    super()
    this.folded = folded
  }
  eq(other) {
    return other.folded === this.folded
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-foldMarker'
    span.textContent = this.folded ? '▸' : '▾'
    span.title = this.folded ? 'Unfold' : 'Fold'
    return span
  }
  ignoreEvent() {
    return false
  }
}

// The marker on the cursor's line, where that line starts a foldable range or
// a fold.
const marker = StateField.define({
  create: (state) => markerFor(state),
  update: (value, tr) => (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)) ? markerFor(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
})

function markerFor(state) {
  const line = state.doc.lineAt(state.selection.main.head)
  const folded = foldedAt(state, line)
  if (!folded && !foldable(state, line.from, line.to)) return Decoration.none
  return Decoration.set([Decoration.widget({ widget: new FoldMarker(!!folded), side: 1 }).range(line.to)])
}

const markerClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!e.target.classList?.contains('cm-foldMarker')) return false
    e.preventDefault()
    const line = view.state.doc.lineAt(view.posAtDOM(e.target))
    const folded = foldedAt(view.state, line)
    if (folded) view.dispatch({ effects: unfoldEffect.of(folded) })
    else {
      const range = foldable(view.state, line.from, line.to)
      if (range) view.dispatch({ effects: foldEffect.of(range) })
    }
    return true
  },
})

// Folds the frontmatter and every section at every level, so that the note
// collapses to its headings and each opens to its own sub-headings; or, when
// anything is folded, unfolds all.
export function toggleFoldAll(view) {
  const { state } = view
  if (foldedRanges(state).size) return unfoldAll(view)
  const effects = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Frontmatter' && !/^ATXHeading/.test(node.name)) return node.name === 'Document'
      const line = state.doc.lineAt(node.from)
      const range = foldable(state, line.from, line.to)
      if (range) effects.push(foldEffect.of(range))
      return false
    },
  })
  if (!effects.length) return foldAll(view)
  view.dispatch({ effects })
  return true
}

export const foldKeymap = [
  { key: 'Mod-Alt-[', run: foldCode },
  { key: 'Mod-Alt-]', run: unfoldCode },
  { key: 'Mod-Alt-.', run: toggleFoldAll },
]

export const folding = [codeFolding({ placeholderText: '…' }), frontmatterFold, marker, markerClick]
