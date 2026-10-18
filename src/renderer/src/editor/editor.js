// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Markdown source editor of the split mode: one CodeMirror view, one
// EditorState per open note (so undo history survives switching notes, R3.4).

import { EditorState, Annotation } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { yaml } from '@codemirror/lang-yaml'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { VaultMarkdown, detectLineSeparator } from '../../../shared/markdown.js'

// Marks a transaction that loads disk content rather than a user edit.
export const External = Annotation.define()

export function createEditor(parent, { onUserChange, onScroll }) {
  const extensions = (language) => [
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    language === 'yaml' ? yaml() : markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }),
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
    // A fresh state for a file's disk text, keeping its line separator;
    // language is 'markdown' (notes) or 'yaml' (.base files).
    createState: (text, language = 'markdown') =>
      EditorState.create({ doc: text, extensions: [EditorState.lineSeparator.of(detectLineSeparator(text)), ...extensions(language)] }),
    setState: (state) => view.setState(state),
    getState: () => view.state,
    // The note's text exactly as it will be written (R1.3, R1.4).
    text: (state = view.state) => state.sliceDoc(),
    // Replace the document with new disk content, as one external change.
    replaceFromDisk(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: [External.of(true)] })
    },
    focus: () => view.focus(),
    // The document position under a point of the window, or null.
    posAt: (x, y) => view.posAtCoords({ x, y }),
    // Inserts text as an edit of the user's (so it saves), at pos or the end.
    insert(text, pos = null) {
      const at = pos ?? view.state.doc.length
      view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length }, userEvent: 'input.drop' })
    },
    // Puts the cursor at the start of a 1-based line and scrolls it to the top.
    gotoLine(n) {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)))
      view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
    },
  }
}
