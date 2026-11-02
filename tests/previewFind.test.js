// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { findMatches, findTermMatches } from '../src/renderer/src/previewFind.js'
import { createEditor } from '../src/renderer/src/editor/editor.js'
import { searchPanelOpen, SearchQuery, setSearchQuery, replaceAll } from '@codemirror/search'

function preview(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  document.body.replaceChildren(div)
  return div
}

describe('the terms of a search marked in a block (R5.1)', () => {
  it('marks words and phrases ignoring case, and regular expressions', () => {
    const root = preview('<p>Plant peas in Spring, then spring onions; v12 and v7.</p>')
    expect(findTermMatches(root, [{ text: 'spring' }]).map((r) => r.toString())).toEqual(['Spring', 'spring'])
    expect(findTermMatches(root, [{ text: 'peas in' }, { regex: 'v\\d+', flags: 'i' }]).map((r) => r.toString())).toEqual(['peas in', 'v12', 'v7'])
  })
  it('ignores an invalid regular expression and an empty block', () => {
    expect(findTermMatches(preview('<p>a</p>'), [{ regex: '(', flags: 'i' }])).toEqual([])
    expect(findTermMatches(preview(''), [{ text: 'a' }])).toEqual([])
  })
})

describe('find in the preview (R4.7)', () => {
  it('finds every match, ignoring case by default', () => {
    const root = preview('<h1>Spring planting</h1><p>Plant peas in spring.</p>')
    expect(findMatches(root, 'spring').map((r) => r.toString())).toEqual(['Spring', 'spring'])
    expect(findMatches(root, 'spring', { caseSensitive: true }).map((r) => r.toString())).toEqual(['spring'])
  })
  it('finds a match that runs across inline elements', () => {
    const root = preview('<p>Mulch the <strong>straw</strong>berries now.</p>')
    const [m] = findMatches(root, 'strawberries')
    expect(m.toString()).toBe('strawberries')
  })
  it('never joins the end of one block to the start of the next', () => {
    const root = preview('<p>end of one</p><p>start of two</p>')
    expect(findMatches(root, 'onestart')).toEqual([])
  })
  it('leaves out diagrams, frames and embedded files', () => {
    const root = preview('<p>rain</p><div class="mermaid-diagram"><svg><text>rain</text></svg></div><div class="attachment-embed"><p>rain</p></div>')
    expect(findMatches(root, 'rain')).toHaveLength(1)
  })
  it('finds nothing for an empty query or an empty preview', () => {
    expect(findMatches(preview('<p>text</p>'), '')).toEqual([])
    expect(findMatches(preview(''), 'text')).toEqual([])
  })
})

describe('find in the editor (R4.7)', () => {
  it('opens the find panel', () => {
    const parent = document.createElement('div')
    document.body.replaceChildren(parent)
    const editor = createEditor(parent, { onUserChange: () => {} })
    editor.setState(editor.createState('peas and more peas'))
    editor.openFind()
    expect(searchPanelOpen(editor.view.state)).toBe(true)
  })
  it('replaces nothing in a read-only workspace (R2.8)', () => {
    const parent = document.createElement('div')
    document.body.replaceChildren(parent)
    const editor = createEditor(parent, { onUserChange: () => {} })
    editor.setReadOnly(true)
    editor.setState(editor.createState('peas and more peas'))
    editor.view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'peas', replace: 'beans' })) })
    expect(replaceAll(editor.view)).toBe(false)
    expect(editor.text()).toBe('peas and more peas')
  })
})
