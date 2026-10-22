// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
//
// The editor in a DOM (jsdom): its key bindings and its language set-up.
import { describe, it, expect, beforeAll } from 'vitest'
import { runScopeHandlers } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { CompletionContext } from '@codemirror/autocomplete'
import { createEditor } from '../src/renderer/src/editor/editor.js'
import { vaultCompletions } from '../src/renderer/src/editor/completion.js'

// jsdom has no layout; CodeMirror measures text through these.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
  Range.prototype.getClientRects = () => []
  Range.prototype.getBoundingClientRect = () => rect
})

const vault = {
  files: () => ['Welcome.md', 'Projects/Plan.md'],
  current: () => 'Welcome.md',
  readNote: async () => '',
  tags: async () => [],
}

function editorWith(text, cursor) {
  const editor = createEditor(document.body.appendChild(document.createElement('div')), { onUserChange: () => {}, vault })
  editor.setState(editor.createState(text))
  editor.view.dispatch({ selection: { anchor: cursor } })
  return editor
}

const press = (editor, key, mods = {}) =>
  runScopeHandlers(editor.view, new KeyboardEvent('keydown', { key, ...mods }), 'editor')

describe('list keys', () => {
  it('Tab nests an ordered item at its content column', () => {
    const editor = editorWith('1. a\n2. b', 8)
    expect(press(editor, 'Tab')).toBe(true)
    expect(editor.text()).toBe('1. a\n   1. b')
  })

  it('Shift-Tab and Mod-] use the same commands', () => {
    const editor = editorWith('- a\n  - b', 9)
    press(editor, 'Tab', { shiftKey: true })
    expect(editor.text()).toBe('- a\n- b')
    const mod = navigator.platform.startsWith('Mac') ? { metaKey: true } : { ctrlKey: true }
    press(editor, ']', mod)
    expect(editor.text()).toBe('- a\n  - b')
  })

  it('Tab off a list inserts the indent unit as before', () => {
    const editor = editorWith('text', 0)
    press(editor, 'Tab')
    expect(editor.text()).toBe('  text')
  })
})

describe('frontmatter', () => {
  it('is parsed as YAML inside the note', () => {
    const editor = editorWith('---\ntitle: Alpha\n---\n# Body\n', 0)
    const names = []
    syntaxTree(editor.view.state).iterate({ enter: (n) => void names.push(n.name) })
    expect(names).toContain('Frontmatter')
    expect(names).toContain('Pair')
    expect(names).not.toContain('SetextHeading2')
  })
})

describe('link completion', () => {
  // Accepts the first completion offered at the cursor.
  async function accept(editor) {
    const { state } = editor.view
    const result = await vaultCompletions(vault)(new CompletionContext(state, state.selection.main.head, false))
    const option = result.options[0]
    option.apply(editor.view, option, result.from, state.selection.main.head)
  }

  it('inserts the target and closes the link', async () => {
    const editor = editorWith('See [[pla', 9)
    await accept(editor)
    expect(editor.text()).toBe('See [[Plan]]')
    expect(editor.view.state.selection.main.head).toBe(12)
  })

  it('steps over a ]] already typed', async () => {
    const editor = editorWith('[[Wel]] after', 5)
    await accept(editor)
    expect(editor.text()).toBe('[[Welcome]] after')
    expect(editor.view.state.selection.main.head).toBe(11)
  })
})
