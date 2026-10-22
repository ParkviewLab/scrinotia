// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { VaultMarkdown } from '../src/shared/markdown.js'
import { indentListItem, outdentListItem, parseItem } from '../src/renderer/src/editor/lists.js'

// Runs a command on a document whose cursor is marked | (or a selection
// marked by two |); returns the new document with the cursor marked, or false
// when the command declined the key.
function run(command, marked) {
  const at = [...marked.matchAll(/\|/g)].map((m, k) => m.index - k)
  const doc = marked.replaceAll('|', '')
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(at[0], at[1] ?? at[0]),
    extensions: markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }),
  })
  const handled = command({ state, dispatch: (tr) => (state = tr.state) })
  if (!handled) return false
  const head = state.selection.main.head
  return state.doc.toString().slice(0, head) + '|' + state.doc.toString().slice(head)
}

describe('parseItem', () => {
  it('finds the content column of each marker', () => {
    expect(parseItem('- a').content).toBe(2)
    expect(parseItem('1. a').content).toBe(3)
    expect(parseItem('10. a').content).toBe(4)
    expect(parseItem('  -   a').content).toBe(6)
    expect(parseItem('- [ ] task').content).toBe(2)
    expect(parseItem('text')).toBe(null)
  })
})

describe('indent (Tab, Mod-])', () => {
  it('nests a bullet under the bullet above', () => {
    expect(run(indentListItem, '- a\n- |b')).toBe('- a\n  - |b')
  })

  it('nests an ordered item at the content column above, and renumbers', () => {
    expect(run(indentListItem, '1. a\n2. |b\n3. c')).toBe('1. a\n   1. |b\n2. c')
    expect(run(indentListItem, '9. a\n10. |b')).toBe('9. a\n   1. |b')
  })

  it('takes the item’s sub-items with it', () => {
    expect(run(indentListItem, '- a\n- |b\n  - c\n- d')).toBe('- a\n  - |b\n    - c\n- d')
  })

  it('does nothing to the first item, but keeps the key', () => {
    expect(run(indentListItem, '- |a\n- b')).toBe('- |a\n- b')
  })

  it('declines off a list, in code and in frontmatter', () => {
    expect(run(indentListItem, 'plain |text')).toBe(false)
    expect(run(indentListItem, '```\n- a\n- |b\n```')).toBe(false)
    expect(run(indentListItem, '---\ntags:\n  - a\n  - |b\n---\n')).toBe(false)
    expect(run(indentListItem, '> - a\n> - |b')).toBe(false)
  })

  it('moves a selection of items together', () => {
    expect(run(indentListItem, '1. a\n2. |b\n3. c|\n4. d')).toBe('1. a\n   1. b\n   2. c|\n2. d')
  })
})

describe('outdent (Shift-Tab, Mod-[)', () => {
  it('moves an item out to its parent’s column, and renumbers both lists', () => {
    expect(run(outdentListItem, '1. a\n   1. b\n   2. |c\n2. d')).toBe('1. a\n   1. b\n2. |c\n3. d')
  })

  it('moves a bullet out with its sub-items', () => {
    expect(run(outdentListItem, '- a\n  - |b\n    - c')).toBe('- a\n- |b\n  - c')
  })

  it('does nothing at the margin, but keeps the key', () => {
    expect(run(outdentListItem, '- |a')).toBe('- |a')
  })
})
