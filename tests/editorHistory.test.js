// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { history, undo, undoDepth } from '@codemirror/commands'
import { diskReplacement } from '../src/renderer/src/editor/editor.js'

function apply(state, spec) {
  return state.update(spec).state
}

function undone(state) {
  let out = state
  undo({ state, dispatch: (tr) => (out = tr.state) })
  return out
}

describe('Load from disk and undo (item 17)', () => {
  it('keeps the disk replacement out of the undo history', () => {
    let state = EditorState.create({ doc: 'old', extensions: [history()] })
    state = apply(state, { changes: { from: 3, insert: ' mine' }, userEvent: 'input.type' })
    expect(undoDepth(state)).toBe(1)
    state = apply(state, diskReplacement(state, 'newer on disk'))
    expect(state.sliceDoc()).toBe('newer on disk')
    expect(undone(state).sliceDoc()).toBe('newer on disk')
  })
  it('undoes edits made after the replacement, and no further', () => {
    let state = EditorState.create({ doc: 'old', extensions: [history()] })
    state = apply(state, diskReplacement(state, 'disk'))
    state = apply(state, { changes: { from: 4, insert: '!' }, userEvent: 'input.type' })
    state = undone(state)
    expect(state.sliceDoc()).toBe('disk')
    expect(undone(state).sliceDoc()).toBe('disk')
  })
})
