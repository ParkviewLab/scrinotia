// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import {
  bookmarkName,
  namesInNote,
  markerPlan,
  insertMarkers,
  removeMarkers,
  captureLocators,
  renderedWords,
  locateRendered,
  resolveBookmark,
  headingPath,
  normaliseStore,
  moveInStore,
} from '../src/shared/bookmarks.js'

const NOTE = `# Plan

## Migration

The migration moves the notes from the old server to the new one over a weekend, with a rollback ready if the checks fail.

The second paragraph has no block id. ^second

## Tasks

- Back up the old server
- Run the checks
`

const span = (text, words) => {
  const from = text.indexOf(words)
  return [from, from + words.length]
}

describe('bookmark names (R2.10)', () => {
  it('takes the first significant words, readable', () => {
    expect(bookmarkName('the old server to the new one')).toBe('old-server-new-one')
    expect(bookmarkName('Café Été, déjà vu!')).toBe('cafe-ete-deja-vu')
  })
  it('stays under 30 characters', () => {
    const name = bookmarkName('extraordinarily lengthy considerations regarding infrastructure')
    expect(name.length).toBeLessThan(30)
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
  it('is made unique with -2, -3', () => {
    expect(bookmarkName('old server', new Set(['old-server']))).toBe('old-server-2')
    expect(bookmarkName('old server', new Set(['old-server', 'old-server-2']))).toBe('old-server-3')
  })
  it('falls back to a short random name', () => {
    expect(bookmarkName('—…—', new Set(), () => 0.5)).toMatch(/^bm-[a-z0-9]{5}$/)
    expect(bookmarkName('日本語', new Set(), () => 0.1)).toMatch(/^bm-/)
  })
  it('collects the names a note already uses', () => {
    expect([...namesInNote('a ^one\nb %%bm:two%%x%%/bm:two%%\n')].sort()).toEqual(['one', 'two'])
  })
})

describe('where markers may go (R2.10)', () => {
  it('wraps words in a paragraph and adds a block id at its end', () => {
    const [from, to] = span(NOTE, 'old server to the new one')
    const out = insertMarkers(NOTE, from, to, 'old-server')
    expect(out.text).toContain('from the %%bm:old-server%%old server to the new one%%/bm:old-server%% over')
    expect(out.text).toContain('if the checks fail. ^old-server\n')
    expect(out).toMatchObject({ marker: 'old-server', blockId: 'old-server', blockIdCreated: true })
  })
  it('reuses a block id already there', () => {
    const [from, to] = span(NOTE, 'no block id')
    const out = insertMarkers(NOTE, from, to, 'no-block')
    expect(out).toMatchObject({ marker: 'no-block', blockId: 'second', blockIdCreated: false })
    expect(out.text).toContain('has %%bm:no-block%%no block id%%/bm:no-block%%. ^second')
  })
  it('marks a list item on its own line', () => {
    const [from, to] = span(NOTE, 'Run the checks')
    const out = insertMarkers(NOTE, from, to, 'run-checks')
    expect(out.text).toContain('- %%bm:run-checks%%Run the checks%%/bm:run-checks%% ^run-checks\n')
  })
  it('writes nothing in a heading, code, frontmatter or a table', () => {
    const cases = [
      ['---\ntitle: Old server\n---\n\nText.\n', 'Old server'],
      ['## Old server here\n', 'Old server'],
      ['```\nold server\n```\n', 'old server'],
      ['| a | b |\n|---|---|\n| old server | x |\n', 'old server'],
    ]
    for (const [text, words] of cases) {
      const [from, to] = span(text, words)
      expect(markerPlan(text, from, to)).toEqual({ pair: null, block: null })
      expect(insertMarkers(text, from, to, 'x').text).toBe(text)
    }
  })
  it('moves the pair out of inline code, a link or math it would cut', () => {
    const text = 'See `old server` and [[Plan|the plan]] and $x+1$ today.\n'
    const [from] = span(text, 'server` and [[Plan|the')
    const [, to] = span(text, 'and $x')
    const out = insertMarkers(text, from, to, 'n')
    expect(out.text).toBe('See %%bm:n%%`old server` and [[Plan|the plan]] and $x+1$%%/bm:n%% today. ^n\n')
  })
  it('spans several paragraphs, with the block id on the first', () => {
    const [from] = span(NOTE, 'rollback ready')
    const [, to] = span(NOTE, 'The second paragraph')
    const out = insertMarkers(NOTE, from, to, 'span')
    expect(out.text).toContain('a %%bm:span%%rollback ready if the checks fail. ^span\n\nThe second paragraph%%/bm:span%% has')
  })
  it('keeps a quote prefix out of the marker', () => {
    const text = '> First line of the quote\n> second line here\n'
    const [from, to] = span(text, 'second line')
    expect(insertMarkers(text, from, to, 'q').text).toBe('> First line of the quote\n> %%bm:q%%second line%%/bm:q%% here ^q\n')
  })
  it('removes its markers, and the block id only when asked', () => {
    const [from, to] = span(NOTE, 'old server to the new one')
    const { text } = insertMarkers(NOTE, from, to, 'old-server')
    expect(removeMarkers(text, 'old-server', { removeBlockId: true })).toBe(NOTE)
    expect(removeMarkers(text, 'old-server')).toContain('fail. ^old-server')
    expect(removeMarkers(text, 'old-server')).not.toContain('%%')
  })
})

describe('finding a bookmark again (R2.10)', () => {
  const make = (text, words, name) => {
    const [from, to] = span(text, words)
    const loc = captureLocators(text, from, to)
    const out = insertMarkers(text, from, to, name)
    return { note: out.text, bm: { marker: out.marker, blockId: out.blockId, ...loc } }
  }
  it('captures the words, some text around them, the heading path and the line', () => {
    const [from, to] = span(NOTE, 'old server')
    const loc = captureLocators(NOTE, from, to)
    expect(loc.quote.exact).toBe('old server')
    expect(loc.quote.prefix.endsWith('notes from the ')).toBe(true)
    expect(loc.quote.suffix.startsWith(' to the new one')).toBe(true)
    expect(loc.heading).toEqual(['Plan', 'Migration'])
    expect(loc.line).toBe(5)
  })
  it('finds it by its markers, even after the words are rewritten', () => {
    const { note, bm } = make(NOTE, 'old server to the new one', 'old-server')
    const edited = note.replace('old server to the new one', 'legacy host onto the replacement')
    const found = resolveBookmark(edited, bm)
    expect(found.by).toBe('marker')
    expect(edited.slice(found.from, found.to)).toBe('legacy host onto the replacement')
    expect(found.line).toBe(5)
  })
  it('falls back to the block id, then the words, then the heading, then the line', () => {
    const { note, bm } = make(NOTE, 'old server', 'old-server')
    const noPair = removeMarkers(note, 'old-server')
    expect(resolveBookmark(noPair, bm).by).toBe('block')
    const noMarks = removeMarkers(note, 'old-server', { removeBlockId: true })
    const byQuote = resolveBookmark(noMarks, bm)
    expect(byQuote.by).toBe('quote')
    expect(noMarks.slice(byQuote.from, byQuote.to)).toBe('old server')
    const rewritten = noMarks.replace('old server', 'legacy host')
    expect(resolveBookmark(rewritten, bm)).toMatchObject({ by: 'heading', line: 3 })
    expect(resolveBookmark('Nothing else.\n', bm)).toMatchObject({ by: 'line', line: 2 })
  })
  it('sees past other bookmarks’ markers', () => {
    const one = make(NOTE, 'notes from the old server', 'notes-old')
    const [from, to] = span(one.note, 'the new one')
    const loc = captureLocators(one.note, from, to)
    expect(loc.quote.prefix).not.toContain('%%')
    const found = resolveBookmark(one.note, { quote: loc.quote })
    expect(one.note.slice(found.from, found.to)).toBe('the new one')
  })
  it('gives the heading path of a position', () => {
    expect(headingPath(NOTE, NOTE.indexOf('Run the checks'))).toEqual(['Plan', 'Tasks'])
  })
})

describe('a preview selection in the source (R2.10)', () => {
  const text = 'Intro.\n\nThe **old server** moves to [[Hosts|the new one]] over a `weekend` ^x\n\nAfter.\n'
  it('finds rendered words through markup', () => {
    const found = locateRendered(text, 3, 3, 'old server moves to the new one')
    expect(text.slice(found.from, found.to)).toBe('old server** moves to [[Hosts|the new one')
  })
  it('finds words across lines and ignores case and spacing', () => {
    const two = 'First line ends\nsecond line starts.\n'
    const found = locateRendered(two, 1, 2, 'ends  Second line')
    expect(two.slice(found.from, found.to)).toBe('ends\nsecond line')
  })
  it('gives null when the words are not there', () => {
    expect(locateRendered(text, 1, 1, 'old server')).toBe(null)
  })
  it('turns source into the words the preview shows', () => {
    expect(renderedWords('The **old** [[Hosts|new one]] `x` %%c%% ^id')).toBe('The old new one x')
  })
})

describe('the stored list (R2.10)', () => {
  it('drops malformed entries and keeps each in the order once, newest first for new ones', () => {
    const store = normaliseStore({
      order: ['b', 'b', 'gone'],
      items: {
        a: { path: 'A.md', created: '2026-11-16T10:00:00Z' },
        b: { path: 'B.md', created: '2026-11-15T10:00:00Z' },
        c: { path: 'C.md', created: '2026-11-17T10:00:00Z' },
        'Bad Name': { path: 'X.md' },
        d: { nope: true },
      },
    })
    expect(store.order).toEqual(['c', 'a', 'b'])
    expect(Object.keys(store.items).sort()).toEqual(['a', 'b', 'c'])
  })
  it('follows notes that moved', () => {
    const store = normaliseStore({ order: ['a'], items: { a: { path: 'Old/Plan.md' } } })
    expect(moveInStore(store, [['Old/Plan.md', 'New/Plan.md']]).items.a.path).toBe('New/Plan.md')
    expect(moveInStore(store, [['Other.md', 'X.md']])).toBe(store)
  })
})

describe('markers as an editor applies them (R2.10)', () => {
  it('gives inserts in the original positions that make the same text', () => {
    const [from] = span(NOTE, 'rollback ready')
    const [, to] = span(NOTE, 'if the checks fail.')
    const out = insertMarkers(NOTE, from, to, 'end')
    let text = NOTE
    for (const c of [...out.inserts].reverse()) text = text.slice(0, c.from) + c.insert + text.slice(c.from)
    expect(text).toBe(out.text)
    expect(out.text).toContain('fail.%%/bm:end%% ^end\n')
  })
})
