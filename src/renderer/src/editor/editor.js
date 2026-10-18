// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The note editor: one CodeMirror view, one EditorState per open note (so
// undo history survives switching notes, R3.4), and three modes: live
// preview, source, and reading.

import { EditorState, Compartment, Annotation } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { VaultMarkdown, detectLineSeparator } from '../../../shared/markdown.js'
import { livePreview, linkClicks, linkResolves } from './livePreview.js'

// Marks a transaction that loads disk content rather than a user edit.
export const External = Annotation.define()

const modeSlot = new Compartment()
const resolveSlot = new Compartment()

function modeExtensions(mode) {
  if (mode === 'source') return []
  if (mode === 'reading') return [livePreview({ reveal: false }), EditorState.readOnly.of(true), EditorView.editable.of(false)]
  return [livePreview()]
}

export function createEditor(parent, { onUserChange, onFollow }) {
  let mode = 'live'
  let resolves = () => true

  const extensions = () => [
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    modeSlot.of(modeExtensions(mode)),
    resolveSlot.of(linkResolves.of(resolves)),
    linkClicks(onFollow),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) onUserChange(u.state)
    }),
  ]

  const view = new EditorView({ parent, state: EditorState.create({ doc: '' }) })

  function stateFor(text) {
    return EditorState.create({
      doc: text,
      extensions: [EditorState.lineSeparator.of(detectLineSeparator(text)), ...extensions()],
    })
  }

  return {
    view,
    // A fresh state for a note's disk text, keeping its line separator.
    createState: stateFor,
    setState(state) {
      view.setState(state)
      view.dispatch({ effects: [modeSlot.reconfigure(modeExtensions(mode)), resolveSlot.reconfigure(linkResolves.of(resolves))] })
    },
    getState: () => view.state,
    // The note's text exactly as it will be written (R1.3, R1.4).
    text: (state = view.state) => state.sliceDoc(),
    // Replace the document with new disk content, as one external change.
    replaceFromDisk(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: [External.of(true)],
      })
    },
    setMode(next) {
      mode = next
      view.dispatch({ effects: modeSlot.reconfigure(modeExtensions(mode)) })
    },
    setResolver(fn) {
      resolves = fn
      view.dispatch({ effects: resolveSlot.reconfigure(linkResolves.of(resolves)) })
    },
    focus: () => view.focus(),
  }
}
