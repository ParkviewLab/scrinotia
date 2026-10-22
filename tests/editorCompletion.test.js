// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { VaultMarkdown } from '../src/shared/markdown.js'
import { vaultCompletions, shortestLink, listBlockIds } from '../src/renderer/src/editor/completion.js'

const root = join(import.meta.dirname, 'fixtures', 'vault')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(root, join(dir, e.name)).split('\\').join('/')],
  )
const files = walk(root).filter((p) => !p.startsWith('.'))

const vault = (current) => ({
  files: () => files,
  current: () => current,
  readNote: async (path) => readFileSync(join(root, path), 'utf8'),
  tags: async () => [
    ['idea', 3],
    ['project', 1],
    ['project/active', 1],
  ],
})

// The completions at the end of doc, typed in the note at current.
async function complete(doc, current = 'Welcome.md', explicit = false) {
  const pos = doc.length
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }) })
  return vaultCompletions(vault(current))(new CompletionContext(state, pos, explicit))
}

describe('the shortest link', () => {
  it('is the file name where it resolves, else the folders it takes', () => {
    expect(shortestLink('Welcome.md', 'Ideas.md', files)).toBe('Welcome')
    expect(shortestLink('Projects/Plan.md', 'Ideas.md', files)).toBe('Plan')
    expect(shortestLink('Projects/Archive/Plan.md', 'Ideas.md', files)).toBe('Archive/Plan')
    expect(shortestLink('attachments/diagram.png', 'Ideas.md', files)).toBe('diagram.png')
  })
})

describe('after [[', () => {
  it('lists notes and files ranked as the quick switcher ranks them', async () => {
    const result = await complete('See [[plan')
    expect(result.from).toBe(6)
    expect(result.options.slice(0, 2).map((o) => o.label)).toEqual(['Plan', 'Archive/Plan'])
    expect(result.options[0].detail).toBe('Projects')
  })

  it('offers files as well as notes, and embeds the same way', async () => {
    const result = await complete('![[diag')
    expect(result.options[0].label).toBe('diagram.png')
  })

  it('lists headings after #, and block ids after #^', async () => {
    const heads = await complete('[[Long note#')
    expect(heads.options.map((o) => o.label)).toEqual(['Long note', 'Section A', 'Section B', 'Section C'])
    const ids = await complete('[[Long note#^')
    expect(ids.options.map((o) => o.label)).toEqual(['keyline', 'pt2'])
  })

  it('offers nothing in an alias, in code or for a note that does not exist', async () => {
    expect(await complete('[[Welcome|al')).toBe(null)
    expect(await complete('```\n[[Wel')).toBe(null)
    expect(await complete('[[Nowhere#')).toBe(null)
  })
})

describe('tags', () => {
  it('completes # outside a link, most used first', async () => {
    const result = await complete('An #pro')
    expect(result.from).toBe(4)
    expect(result.options.map((o) => o.label)).toContain('project/active')
    expect(result.options[0].boost).toBe(20)
  })

  it('waits for a letter after a bare #, so a heading is typed in peace', async () => {
    expect(await complete('#')).toBe(null)
    expect(await complete('a #')).toBe(null)
  })
})

describe('block ids', () => {
  it('are read from the end of lines', () => {
    expect(listBlockIds('a ^one\nb\n- c ^two  \nd^no')).toEqual(['one', 'two'])
  })
})
