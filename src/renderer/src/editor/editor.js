// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Markdown source editor of the split mode: one CodeMirror view, one
// EditorState per open note (so undo history survives switching notes, R3.4).

import { EditorState, Annotation, Transaction, Compartment } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, selectAll } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { yaml, yamlLanguage } from '@codemirror/lang-yaml'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { parseMixed } from '@lezer/common'
import { tags as t } from '@lezer/highlight'
import { VaultMarkdown, vaultTags, detectLineSeparator } from '../../../shared/markdown.js'
import { listKeymap } from './lists.js'
import { vaultCompletions } from './completion.js'
import { codeLanguages } from './codeLanguages.js'
import { formatKeymap } from './format.js'
import { folding, foldKeymap } from './fold.js'
import { linkAt } from './links.js'
import { notProse } from './spelling.js'

// The editor's syntax colours: CodeMirror's default style, read from colour
// tokens in theme.css so that the dark theme has its own legible values. The
// vault's own syntax is coloured too, Markdown's marks are dimmed, and
// headings are sized by level, so that the source shows the note's structure.
const highlightStyle = HighlightStyle.define([
  { tag: t.meta, color: 'var(--syn-meta)' },
  { tag: t.link, textDecoration: 'underline', color: 'var(--syn-link)' },
  { tag: vaultTags.alias, textDecoration: 'none', color: 'var(--syn-alias)' },
  { tag: vaultTags.highlight, background: 'var(--syn-highlight)', borderRadius: '2px' },
  { tag: t.processingInstruction, textDecoration: 'none', color: 'var(--syn-mark)' },
  { tag: t.heading, fontWeight: 'bold' },
  { tag: t.heading1, fontSize: '1.4em' },
  { tag: t.heading2, fontSize: '1.25em' },
  { tag: t.heading3, fontSize: '1.12em' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.keyword, color: 'var(--syn-keyword)' },
  { tag: [t.atom, t.bool, t.url, t.contentSeparator, t.labelName], color: 'var(--syn-url)' },
  { tag: [t.literal, t.inserted], color: 'var(--syn-literal)' },
  { tag: [t.string, t.deleted], color: 'var(--syn-string)' },
  { tag: [t.regexp, t.escape, t.special(t.string)], color: 'var(--syn-special)' },
  { tag: t.definition(t.variableName), color: 'var(--syn-definition)' },
  { tag: t.local(t.variableName), color: 'var(--syn-local)' },
  { tag: [t.typeName, t.namespace], color: 'var(--syn-type)' },
  { tag: t.className, color: 'var(--syn-class)' },
  { tag: [t.special(t.variableName), t.macroName], color: 'var(--syn-macro)' },
  { tag: t.definition(t.propertyName), color: 'var(--syn-property)' },
  { tag: t.comment, color: 'var(--syn-comment)' },
  { tag: t.invalid, color: 'var(--syn-invalid)' },
])

// The frontmatter's content (a node of the shared parser) is shown as YAML.
const FrontmatterYaml = {
  wrap: parseMixed((node) => (node.name === 'FrontmatterContent' ? { parser: yamlLanguage.parser } : null)),
}

// The image types a paste writes to the vault (R2.7).
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/

// Marks a transaction that loads disk content rather than a user edit.
export const External = Annotation.define()

// The transaction that replaces a document with its disk text: external, and
// kept out of the undo history (item 17), so that undo stays within the
// person's own edits and cannot restore the older text over the newer file.
export function diskReplacement(state, text) {
  return {
    changes: { from: 0, to: state.doc.length, insert: text },
    annotations: [External.of(true), Transaction.addToHistory.of(false)],
  }
}

// Spell checking in notes, a vault setting (editor.json); .base files, being
// YAML, are never checked. Autocorrect stays off.
const spelling = new Compartment()
const spellAttributes = (on) => EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false', autocorrect: 'off' })

// vault: the hooks completion reads the vault through (completion.js);
// onPasteImage(file): called with an image pasted into a note (R2.7);
// onFollowLink({ kind, ref, newTab }): called on Cmd/Ctrl+click on a link,
// with Shift for a new tab.
export function createEditor(parent, { onUserChange, onScroll, vault, onPasteImage, onFollowLink }) {
  let spellcheck = true
  // In a workspace (R2.8) every state is created read-only: no typing,
  // formatting, list commands or pasting.
  let readOnly = false
  // Completion of links and tags in notes (R4.1); it replaces lang-markdown's
  // own source (HTML tags).
  const completion = vault ? [autocompletion({ override: [vaultCompletions(vault)], icons: false })] : []
  const extensions = (language) => [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    history(),
    drawSelection(),
    highlightActiveLine(),
    EditorView.lineWrapping,
    language === 'yaml' ? yaml() : [markdown({ base: markdownLanguage, codeLanguages, extensions: [VaultMarkdown, FrontmatterYaml] }), completion, folding],
    syntaxHighlighting(highlightStyle),
    // The list keys come first; off a list line they fall through (R3.5).
    // Formatting and folding come before the defaults, whose Mod-Enter
    // (insert a blank line) and Mod-i (select the parent node) they replace.
    keymap.of([
      ...listKeymap,
      ...(language === 'yaml' ? [] : [...formatKeymap({ readClipboard: () => navigator.clipboard.readText() }), ...foldKeymap]),
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) onUserChange(u.state)
    }),
    language === 'yaml' ? spellAttributes(false) : [spelling.of(spellAttributes(spellcheck)), notProse],
    EditorView.domEventHandlers({
      scroll: (_e, view) => onScroll?.(view),
      // Cmd/Ctrl+click follows the link under the pointer, as a click in the
      // preview does; elsewhere it keeps CodeMirror's meaning (add a cursor).
      mousedown: (e, view) => {
        if (e.button !== 0 || !(navigator.platform.startsWith('Mac') ? e.metaKey : e.ctrlKey) || !onFollowLink) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        const link = pos === null ? null : linkAt(view.state, pos)
        if (!link) return false
        e.preventDefault()
        onFollowLink({ kind: link.kind, ref: link.ref, newTab: e.shiftKey })
        return true
      },
      // An image on the clipboard goes to the vault as a file (R2.7); text
      // pastes as before, also when an image comes with it (as spreadsheets
      // and word processors put one beside the text they copy).
      paste: (e) => {
        if (language === 'yaml' || !onPasteImage) return false
        if ([...(e.clipboardData?.types ?? [])].includes('text/plain')) return false
        const file = [...(e.clipboardData?.files ?? [])].find((f) => IMAGE_TYPES.test(f.type))
        if (!file) return false
        e.preventDefault()
        onPasteImage(file)
        return true
      },
    }),
  ]

  const view = new EditorView({ parent, state: EditorState.create({ doc: '' }) })

  return {
    view,
    // A fresh state for a file's disk text, keeping its line separator;
    // language is 'markdown' (notes) or 'yaml' (.base files).
    createState: (text, language = 'markdown') =>
      EditorState.create({ doc: text, extensions: [EditorState.lineSeparator.of(detectLineSeparator(text)), ...extensions(language)] }),
    // A note's stored state takes the spelling setting as it is now.
    setState(state) {
      view.setState(state)
      if (spelling.get(view.state)) view.dispatch({ effects: spelling.reconfigure(spellAttributes(spellcheck)) })
    },
    // Turns spell checking in notes on or off (editor.json).
    setSpellcheck(on) {
      spellcheck = !!on
      if (spelling.get(view.state)) view.dispatch({ effects: spelling.reconfigure(spellAttributes(spellcheck)) })
    },
    // What is under a point of the window, for the context menu: the
    // position, the link there (linkAt) and whether text is selected.
    contextAt(x, y) {
      const pos = view.posAtCoords({ x, y })
      return { pos, link: pos === null ? null : linkAt(view.state, pos), selection: !view.state.selection.main.empty }
    },
    // Replaces the word at pos, if it is word, with replacement (a spelling
    // suggestion), as an edit of the user's.
    replaceWord(pos, word, replacement) {
      const range = view.state.wordAt(pos)
      if (!range || view.state.sliceDoc(range.from, range.to) !== word) return false
      view.dispatch({ changes: { ...range, insert: replacement }, selection: { anchor: range.from + replacement.length }, userEvent: 'input.replace' })
      return true
    },
    selectAll: () => selectAll(view),
    // Whether states created from now on are read-only (a workspace, R2.8).
    setReadOnly(on) {
      readOnly = !!on
    },
    getState: () => view.state,
    // The note's text exactly as it will be written (R1.3, R1.4).
    text: (state = view.state) => state.sliceDoc(),
    // Replace the document with new disk content, as one external change.
    replaceFromDisk(text) {
      view.dispatch(diskReplacement(view.state, text))
    },
    focus: () => view.focus(),
    // The document position under a point of the window, or null.
    posAt: (x, y) => view.posAtCoords({ x, y }),
    // Inserts text as an edit of the user's (so it saves), at pos or the end.
    insert(text, pos = null) {
      const at = pos ?? view.state.doc.length
      view.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length }, userEvent: 'input.drop' })
    },
    // Replaces the selection with text, as a paste of the user's.
    paste(text) {
      view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true })
    },
    // Puts the cursor at the start of a 1-based line and scrolls it to the top.
    gotoLine(n) {
      const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)))
      view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start' }) })
    },
  }
}
