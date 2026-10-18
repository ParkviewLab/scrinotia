// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderBase, compile } from '../src/main/bases.js'
import { createIndex } from '../src/main/linkIndex.js'
import { scanVault, readNote } from '../src/main/vault.js'

const ROOT = join(import.meta.dirname, 'fixtures', 'vault')
const flatten = (t) => t.flatMap((e) => (e.children ? flatten(e.children) : [e.path]))

async function entries() {
  const index = createIndex({ list: async () => flatten(await scanVault(ROOT)), read: (p) => readNote(ROOT, p) })
  await index.rebuild()
  return index.entries()
}

describe('expressions', () => {
  const ctx = { file: { name: 'One', ext: 'md', path: 'T/One.md', folder: 'T', tags: ['a/b'], links: ['X.md'] }, note: { n: 3, list: ['p', 'q'] } }
  it('evaluates comparisons, logic and functions', () => {
    expect(compile('file.ext == "md" && file.name != "README"')(ctx)).toBe(true)
    expect(compile('n > 2 || false')(ctx)).toBe(true)
    expect(compile('!(n >= 4)')(ctx)).toBe(true)
    expect(compile('file.inFolder("T") && file.hasTag("a") && file.hasLink("X")')(ctx)).toBe(true)
    expect(compile('list == "q"')(ctx)).toBe(true)
  })
  it('reports what it does not support', () => {
    expect(() => compile('file.mtime > 3')(ctx)).toThrow(/not supported/)
    expect(() => compile('now()')).toThrow(/not supported/)
  })
})

describe('renderBase', () => {
  it('renders the Tangents base as two sorted table views', async () => {
    const src = await readFile(join(ROOT, 'Tangents', 'Tangents.base'), 'utf8')
    const out = renderBase(src, await entries())
    expect(out.error).toBeUndefined()
    expect(out.views.map((v) => v.name)).toEqual(['By target', 'By date'])
    const [byTarget, byDate] = out.views
    expect(byTarget.columns.map((c) => c.label)).toEqual(['Idea', 'target', 'origin', 'discovered', 'status'])
    expect(byTarget.rows.map((r) => r.cells[0])).toEqual(['Two', 'One'])
    expect(byDate.rows.map((r) => r.cells[0])).toEqual(['2026-09-20', '2026-09-17'])
    expect(byDate.rows[0].path).toBe('Tangents/Two.md')
  })
  it('reports unsupported views and bad YAML', () => {
    expect(renderBase('views:\n  - type: cards\n    name: C\n', []).views[0].error).toMatch(/not supported/)
    expect(renderBase('filters: [', []).error).toMatch(/YAML/)
  })
})
