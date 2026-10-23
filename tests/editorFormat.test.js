// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { toggleMark, toggleTask } from '../src/renderer/src/editor/format.js'

// Runs a command on a document with the selection marked by one or two |;
// returns the document with the new selection marked the same way.
function run(command, marked) {
  const at = [...marked.matchAll(/\|/g)].map((m, k) => m.index - k)
  let state = EditorState.create({
    doc: marked.replaceAll('|', ''),
    selection: EditorSelection.single(at[0], at[1] ?? at[0]),
    extensions: EditorState.allowMultipleSelections.of(true),
  })
  command({ state, dispatch: (tr) => (state = tr.state) })
  const doc = state.doc.toString()
  const { from, to } = state.selection.main
  return from === to ? doc.slice(0, from) + '|' + doc.slice(from) : doc.slice(0, from) + '|' + doc.slice(from, to) + '|' + doc.slice(to)
}

describe('bold and italic', () => {
  const bold = toggleMark('**')
  const italic = toggleMark('*')

  it('wraps the selection, and unwraps it again', () => {
    expect(run(bold, 'a |word| b')).toBe('a **|word|** b')
    expect(run(bold, 'a **|word|** b')).toBe('a |word| b')
    expect(run(bold, 'a |**word**| b')).toBe('a |word| b')
  })

  it('wraps the word at the cursor', () => {
    expect(run(italic, 'a wo|rd b')).toBe('a *wo|rd* b')
    expect(run(italic, 'a *wo|rd* b')).toBe('a wo|rd b')
  })

  it('makes an empty pair where there is no word', () => {
    expect(run(bold, 'a | b')).toBe('a **|** b')
    expect(run(bold, 'a **|** b')).toBe('a | b')
  })

  it('tells italic from bold', () => {
    expect(run(italic, '**|word|**')).toBe('***|word|***')
    expect(run(bold, '***|word|***')).toBe('*|word|*')
    expect(run(italic, '***|word|***')).toBe('**|word|**')
  })
})

describe('inline code and highlight', () => {
  it('wraps and unwraps', () => {
    expect(run(toggleMark('`'), 'a |x = 1| b')).toBe('a `|x = 1|` b')
    expect(run(toggleMark('=='), 'a ==|hi|== b')).toBe('a |hi| b')
  })
})

describe('task boxes (Mod-Enter)', () => {
  it('ticks and clears a box', () => {
    expect(run(toggleTask, '- [ ] a|')).toBe('- [x] a|')
    expect(run(toggleTask, '  1. [X] a|')).toBe('  1. [ ] a|')
  })

  it('makes a box on a list item or a plain line', () => {
    expect(run(toggleTask, '- a|')).toBe('- [ ] a|')
    expect(run(toggleTask, '  text|')).toBe('  - [ ] text|')
    expect(run(toggleTask, '|')).toBe('- [ ] |')
  })

  it('acts on every selected line once', () => {
    expect(run(toggleTask, '- [ ] |a\n- [x] b|')).toBe('- [x] |a\n- [ ] b|')
  })
})
