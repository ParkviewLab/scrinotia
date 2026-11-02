// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { resultsTree } from '../src/renderer/src/resultsTree.js'

const note = (path) => ({ path, name: path.slice(path.lastIndexOf('/') + 1), type: 'note' })
const folder = (path, children) => ({ path, name: path.slice(path.lastIndexOf('/') + 1), type: 'folder', children })

const TREE = [
  note('Welcome.md'),
  folder('Projects', [note('Projects/Plan.md'), folder('Projects/Archive', [note('Projects/Archive/Plan.md'), note('Projects/Archive/Old.md')])]),
  folder('Empty', [note('Empty/Nothing.md')]),
]

const shape = (nodes) => nodes.map((n) => (n.children ? { [n.entry.path]: shape(n.children) } : n.entry.path))

describe('resultsTree (R5.1)', () => {
  it('keeps only the folders that hold a result, in the tree order', () => {
    const results = [{ path: 'Projects/Archive/Plan.md' }, { path: 'Welcome.md' }, { path: 'Projects/Plan.md' }]
    const { nodes, unplaced } = resultsTree(TREE, results)
    expect(shape(nodes)).toEqual(['Welcome.md', { Projects: ['Projects/Plan.md', { 'Projects/Archive': ['Projects/Archive/Plan.md'] }] }])
    expect(unplaced).toEqual([])
  })

  it('returns a result the tree does not list apart', () => {
    const { nodes, unplaced } = resultsTree(TREE, [{ path: 'Welcome.md' }, { path: 'New/Gone.md' }])
    expect(shape(nodes)).toEqual(['Welcome.md'])
    expect(unplaced.map((r) => r.path)).toEqual(['New/Gone.md'])
  })

  it('is empty for no results', () => {
    expect(resultsTree(TREE, [])).toEqual({ nodes: [], unplaced: [] })
  })
})
