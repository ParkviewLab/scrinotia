// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { createIndex } from '../src/main/linkIndex.js'

function memoryVault(files) {
  const store = new Map(Object.entries(files))
  return {
    store,
    index: createIndex({ list: async () => [...store.keys()], read: async (p) => store.get(p) }),
  }
}

const VAULT = {
  'Welcome.md': '# Welcome\n\nSee [[Plan]], [[Projects/Plan#Goals|the goals]] and [[Ideas]].\n\nIdeas are mentioned here too.\n',
  'Ideas.md': '---\ntags: [x]\n---\n# Ideas #idea\n\nBack to [[Welcome]]. Code: `[[Welcome]]`.\n',
  'Projects/Plan.md': '# Plan\r\n\r\nLinks to [[Welcome#Heading]] and [rel](../Ideas.md).\r\n',
  'Projects/Archive/Plan.md': '# Old plan\n\nSee [[Plan]].\n',
  'attachments/diagram.png': '',
}

describe('backlinks and mentions', () => {
  it('lists backlinks with their lines, not counting code', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(index.backlinks('Welcome.md').map((b) => [b.source, b.line])).toEqual([
      ['Ideas.md', 6],
      ['Projects/Plan.md', 3],
    ])
    expect(index.backlinks('Ideas.md').map((b) => b.source)).toEqual(['Projects/Plan.md', 'Welcome.md'])
  })

  it('resolves [[Plan]] by folder, then shortest path', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(index.backlinks('Projects/Plan.md').map((b) => b.source)).toEqual(['Welcome.md', 'Welcome.md'])
    expect(index.backlinks('Projects/Archive/Plan.md').map((b) => b.source)).toEqual(['Projects/Archive/Plan.md'])
  })

  it('finds unlinked mentions outside links', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(index.unlinkedMentions('Ideas.md').map((m) => [m.source, m.line])).toEqual([['Welcome.md', 5]])
  })

  it('lists outgoing links and tags', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(index.outgoing('Welcome.md').map((o) => [o.text, o.resolved])).toEqual([
      ['Plan', 'Projects/Plan.md'],
      ['the goals', 'Projects/Plan.md'],
      ['Ideas', 'Ideas.md'],
    ])
    expect(index.tags()).toEqual([['idea', 1], ['x', 1]])
  })
  it('counts a note once for a parent tag', async () => {
    const { index } = memoryVault({ 'a.md': '#p/x #p/y', 'b.md': '#p/x', 'c.md': '#q' })
    await index.rebuild()
    expect(index.tags()).toEqual([['p', 2], ['p/x', 2], ['p/y', 1], ['q', 1]])
  })
})

describe('search', () => {
  const paths = (out) => out.results.map((r) => r.path)
  it('matches words, phrases, exclusions and fields', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(paths(index.search('plan')).sort()).toEqual(['Projects/Archive/Plan.md', 'Projects/Plan.md', 'Welcome.md'])
    expect(paths(index.search('"old plan"'))).toEqual(['Projects/Archive/Plan.md'])
    expect(paths(index.search('plan -archive')).sort()).toEqual(['Projects/Plan.md', 'Welcome.md'])
    expect(paths(index.search('tag:idea'))).toEqual(['Ideas.md'])
    expect(paths(index.search('path:projects goals'))).toEqual([])
    expect(index.search('welcome').results[0].matches.length).toBeGreaterThan(0)
  })
  it('ranks by BM25: a word in the name and used often ranks first', async () => {
    const { index } = memoryVault({
      'Gardening.md': '# Gardening\n\nGardening notes: soil, gardening tools, gardening seasons.',
      'Diary.md': '# Diary\n\nToday some gardening, then reading, cooking and walking for a long while.',
      'Other.md': '# Other\n\nNothing relevant here at all.',
    })
    await index.rebuild()
    expect(paths(index.search('gardening'))).toEqual(['Gardening.md', 'Diary.md'])
  })
  it('matches prefixes, and typos in longer words only', async () => {
    const { index } = memoryVault({ 'a.md': 'The vaulting horse.', 'b.md': 'A cat sat.' })
    await index.rebuild()
    expect(paths(index.search('vault'))).toEqual(['a.md'])
    expect(paths(index.search('vualting'))).toEqual(['a.md'])
    expect(paths(index.search('cta'))).toEqual([])
  })
  it('matches regular expressions, and reports invalid ones', async () => {
    const { index } = memoryVault({ 'a.md': 'Released 2026-10-18.', 'b.md': 'No date.' })
    await index.rebuild()
    expect(paths(index.search('/\\d{4}-\\d{2}-\\d{2}/'))).toEqual(['a.md'])
    expect(index.search('/\\d{4}-\\d{2}-\\d{2}/').results[0].matches[0].context).toBe('Released 2026-10-18.')
    expect(paths(index.search('-/\\d{4}/'))).toEqual(['b.md'])
    expect(index.search('/[unclosed/').error).toMatch(/Not a valid regular expression/)
  })
  it('keeps the ranked index in step with changes', async () => {
    const { store, index } = memoryVault({ 'a.md': 'apple', 'b.md': 'banana' })
    await index.rebuild()
    store.set('a.md', 'cherry')
    store.delete('b.md')
    await index.update(['a.md', 'b.md'])
    expect(paths(index.search('apple'))).toEqual([])
    expect(paths(index.search('banana'))).toEqual([])
    expect(paths(index.search('cherry'))).toEqual(['a.md'])
  })
})

// Apply planned edits and return, per file, the changed text spans only.
function changedSpans(before, after) {
  let start = 0
  while (start < before.length && before[start] === after[start]) start++
  let endB = before.length
  let endA = after.length
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--
    endA--
  }
  return [before.slice(start, endB), after.slice(start, endA)]
}

describe('planRename', () => {
  it('rewrites only the link targets, keeping subpaths, aliases and line endings', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    const edits = index.planRename([['Welcome.md', 'Home.md']])
    const byPath = Object.fromEntries(edits.map((e) => [e.path, e]))
    expect(Object.keys(byPath).sort()).toEqual(['Ideas.md', 'Projects/Plan.md'])
    expect(byPath['Ideas.md'].text).toBe(VAULT['Ideas.md'].replace('Back to [[Welcome]]', 'Back to [[Home]]'))
    expect(byPath['Projects/Plan.md'].text).toBe(VAULT['Projects/Plan.md'].replace('[[Welcome#Heading]]', '[[Home#Heading]]'))
    expect(byPath['Projects/Plan.md'].text).toContain('\r\n')
  })

  it('uses a path when the bare name would resolve elsewhere', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    const edits = index.planRename([['Ideas.md', 'Projects/Archive/Plan notes.md']])
    const welcome = edits.find((e) => e.path === 'Welcome.md')
    expect(welcome.text).toBe(VAULT['Welcome.md'].replace('[[Ideas]]', '[[Plan notes]]'))
    const plan = edits.find((e) => e.path === 'Projects/Plan.md')
    expect(plan.text).toBe(VAULT['Projects/Plan.md'].replace('(../Ideas.md)', '(Archive/Plan%20notes.md)'))
  })

  it('pins links that the new name would capture', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    // Other/Plan.md would now win [[Plan]] from the root (shortest path), so
    // Welcome's existing [[Plan]] is pinned to Projects/Plan.
    const edits = index.planRename([['Ideas.md', 'Other/Plan.md']])
    const welcome = edits.find((e) => e.path === 'Welcome.md')
    expect(welcome.text).toBe(
      VAULT['Welcome.md'].replace('[[Plan]]', '[[Projects/Plan]]').replace('[[Ideas]]', '[[Plan]]'),
    )
  })

  it('handles a moved folder, including links from notes inside it', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    const edits = index.planRename([
      ['Projects/Plan.md', 'Work/Plan.md'],
      ['Projects/Archive/Plan.md', 'Work/Archive/Plan.md'],
    ])
    const welcome = edits.find((e) => e.path === 'Welcome.md')
    expect(changedSpans(welcome.before, welcome.text)).toEqual(['Projects', 'Work'])
    // Work/Plan.md's relative link ../Ideas.md still holds, and the archive's
    // [[Plan]] still means itself, so neither note changes.
    expect(edits.map((e) => e.path)).toEqual(['Welcome.md'])
  })

  it('plans nothing for a file nobody links to', async () => {
    const { index } = memoryVault(VAULT)
    await index.rebuild()
    expect(index.planRename([['attachments/diagram.png', 'attachments/d.png']])).toEqual([])
  })
})
