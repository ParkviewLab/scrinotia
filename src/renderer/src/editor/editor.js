// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Markdown source editor of the split mode: one CodeMirror view, one
// EditorState per open note (so undo history survives switching notes, R3.4).

import { EditorState, Annotation } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { VaultMarkdown, detectLineSeparator } from '../../../shared/markdown.js'

// Marks a transaction that loads disk content rather than a user edit.
export const External = Annotation.define()

export function createEditor(parent, { onUserChange, onScroll }) {
  const extensions = () => [
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) onUserChange(u.state)
    }),
    EditorView.domEventHandlers({ scroll: (_e, view) => onScroll?.(view) }),
  ]

  const view = new EditorView({ parent, state: EditorState.create({ doc: '' }) })

  return {
    view,
    // A fresh state for a note's disk text, keeping its line separator.
    createState: (text) =>
      EditorState.create({ doc: text, extensions: [EditorState.lineSeparator.of(detectLineSeparator(text)), ...extensions()] }),
    setState: (state) => view.setState(state),
    getState: () => view.state,
    // The note's text exactly as it will be written (R1.3, R1.4).
    text: (state = view.state) => state.sliceDoc(),
    // Replace the document with new disk content, as one external change.
    replaceFromDisk(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: [External.of(true)] })
    },
    focus: () => view.focus(),
  }
}
