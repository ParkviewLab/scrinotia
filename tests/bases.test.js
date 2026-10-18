// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderBase, evaluateExpression } from '../src/main/bases.js'
import { parse, parsePropertyId, Unsupported } from '../src/main/bases/parse.js'
import { IMPLEMENTED, UNSUPPORTED } from '../src/main/bases/evaluate.js'
import { DateV, DurationV, LinkV, ErrorV, displayText } from '../src/main/bases/values.js'
import { createIndex } from '../src/main/linkIndex.js'
import { scanVault, readNote, statFile } from '../src/main/vault.js'
import { resolveLink } from '../src/shared/links.js'

const ROOT = join(import.meta.dirname, 'fixtures', 'vault')
const REFS = join(import.meta.dirname, '..', 'docs', 'references', 'obsidian-bases-skill')
const flatten = (t) => t.flatMap((e) => (e.children ? flatten(e.children) : [e.path]))
const NOW = new Date(2026, 9, 18, 15, 30, 0).getTime() // 2026-10-18 15:30 local

async function vaultIndex() {
  const index = createIndex({ list: async () => flatten(await scanVault(ROOT)), read: (p) => readNote(ROOT, p), stat: (p) => statFile(ROOT, p) })
  await index.rebuild()
  return index
}

// A small in-memory vault for expression tests.
const ENTRIES = [
  { path: 'Books/Dune.md', size: 1200, ctime: new Date(2026, 0, 2).getTime(), mtime: new Date(2026, 9, 1).getTime(), frontmatter: { author: 'Herbert', pages: 412, price: 9.5, quantity: 3, done: true, due: '2026-10-25', 'my prop': 'spaced', tags: ['book', 'sf/classic'], list: [3, 1, 2, 2], status: 'reading', cover: '[[cover.png]]' }, tags: ['book', 'sf/classic'], links: ['Authors/Herbert.md'], linkTargets: [{ target: 'Herbert', path: 'Authors/Herbert.md' }], embedTargets: [{ target: 'cover.png', path: 'cover.png' }] },
  { path: 'Authors/Herbert.md', size: 300, ctime: 1, mtime: 2, frontmatter: { born: 1920 }, tags: [], links: [], linkTargets: [], embedTargets: [] },
  { path: 'cover.png', size: 10, ctime: 1, mtime: 1, frontmatter: {}, tags: [], links: [], linkTargets: [], embedTargets: [] },
]
const resolve = (t, from) => resolveLink(t, from, ENTRIES.map((e) => e.path))
const ev = (src, formulas = {}) => evaluateExpression(src, ENTRIES[0], { entries: ENTRIES, resolve, formulas, now: NOW })

describe('parser', () => {
  it('honours precedence, postfix access and regular-expression literals', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('10 / 4')).toBe(2.5)
    expect(ev('7 % 4')).toBe(3)
    expect(ev('-pages + 12')).toBe(-400)
    expect(ev('!done || pages > 400 && price < 10')).toBe(true)
    expect(ev('/^Du/.matches(file.basename)')).toBe(true)
    expect(ev('"a/b".split("/").length')).toBe(2)
  })
  it('does not read hyphens into identifiers', () => {
    expect(ev('pages-12')).toBe(400)
  })
  it('reads property ids without tokenising them', () => {
    expect(parsePropertyId('formula.total')).toEqual({ type: 'formula', name: 'total' })
    expect(parsePropertyId('file.name')).toEqual({ type: 'file', name: 'name' })
    expect(parsePropertyId('my prop')).toEqual({ type: 'note', name: 'my prop' })
    expect(ev('note["my prop"]')).toBe('spaced')
  })
  it('reports what it cannot read', () => {
    expect(() => parse('1 +')).toThrow(Unsupported)
    expect(() => parse('"open')).toThrow(Unsupported)
    expect(() => parse('a @ b')).toThrow(Unsupported)
  })
})

describe('properties', () => {
  it('reads note, file and formula properties', () => {
    expect(ev('author')).toBe('Herbert')
    expect(ev('note.author')).toBe('Herbert')
    expect(ev('missing')).toBeNull()
    expect(ev('file.name')).toBe('Dune.md')
    expect(ev('file.basename')).toBe('Dune')
    expect(ev('file.ext')).toBe('md')
    expect(ev('file.folder')).toBe('Books')
    expect(ev('file.path')).toBe('Books/Dune.md')
    expect(ev('file.size')).toBe(1200)
    expect(ev('file.ctime')).toBeInstanceOf(DateV)
    expect(ev('file.mtime.year')).toBe(2026)
    expect(ev('file.tags')).toEqual(['#book', '#sf/classic'])
    expect(ev('file.links')[0]).toBeInstanceOf(LinkV)
    expect(ev('file.embeds').map((l) => l.path)).toEqual(['cover.png'])
    expect(ev('file.properties.pages')).toBe(412)
    expect(ev('formula.total', { total: 'price * quantity' })).toBe(28.5)
    expect(ev('formula.twice', { total: 'price * quantity', twice: 'formula.total * 2' })).toBe(57)
  })
  it('lists backlinks', () => {
    const herbert = evaluateExpression('file.backlinks', ENTRIES[1], { entries: ENTRIES, resolve, now: NOW })
    expect(herbert.map((l) => l.path)).toEqual(['Books/Dune.md'])
  })
  it('fails a self-referring formula without hanging', () => {
    expect(() => ev('formula.a', { a: 'formula.b', b: 'formula.a' })).toThrow(/refers to itself/)
  })
})

describe('functions', () => {
  it('evaluates the global functions', () => {
    expect(ev('if(done, "yes", "no")')).toBe('yes')
    expect(ev('if(missing, 1)')).toBeNull()
    expect(ev('if(true, 1, 1/0 > 0 && missing.nope())')).toBe(1)
    expect(ev('min(3, 1, 2)')).toBe(1)
    expect(ev('max(3, 1, 2)')).toBe(3)
    expect(ev('number("4.5") + 1')).toBe(5.5)
    expect(ev('list("a")')).toEqual(['a'])
    expect(ev('link("Herbert", "the author")').path).toBe('Authors/Herbert.md')
    expect(ev('file("Herbert").name')).toBe('Herbert.md')
    expect(ev('image(cover)').path).toBe('cover.png')
    expect(ev('html("<b>x</b>")').html).toBe('<b>x</b>')
    expect(ev('escapeHTML("<b>")')).toBe('&lt;b&gt;')
  })
  it('handles dates and durations', () => {
    expect(ev('today()').hasTime).toBe(false)
    expect(ev('today().format("YYYY-MM-DD")')).toBe('2026-10-18')
    expect(ev('now().format("HH:mm")')).toBe('15:30')
    expect(ev('date("2026-10-25 08:00:00").hour')).toBe(8)
    expect(ev('(date(due) - today()).days')).toBe(7)
    expect(ev('date(due) > today()')).toBe(true)
    expect(ev('(today() + "1M").format("YYYY-MM-DD")')).toBe('2026-11-18')
    expect(ev('(today() + "7d").format("YYYY-MM-DD")')).toBe('2026-10-25')
    expect(ev('(now() - "2h").format("HH:mm")')).toBe('13:30')
    expect(ev('(now() + (duration("1d") * 2)).day')).toBe(20)
    expect(ev('(date(due) - today())')).toBeInstanceOf(DurationV)
    expect(ev('date("2026-10-18").format("dddd")')).toBe('Sunday')
    expect(ev('date("2026-10-18 15:00:00").date().format("HH:mm")')).toBe('00:00')
    expect(ev('date("2026-10-18 15:20:00").time()')).toBe('15:20:00')
    expect(ev('date("2026-10-11").relative()')).toBe('8 days ago')
    expect(() => ev('(date(due) - today()).round(0)')).toThrow(/not a method/)
  })
  it('handles strings, numbers, lists and objects', () => {
    expect(ev('author.lower()')).toBe('herbert')
    expect(ev('"the dune saga".title()')).toBe('The Dune Saga')
    expect(ev('author.contains("erb") && author.startsWith("H") && author.endsWith("t")')).toBe(true)
    expect(ev('author.containsAll("H", "b") && author.containsAny("x", "r")')).toBe(true)
    expect(ev('"a-b-a".replace("a", "c")')).toBe('c-b-c')
    expect(ev('"a1b2".replace(/[0-9]/g, "")')).toBe('ab')
    expect(ev('"ab".repeat(2).reverse()')).toBe('baba')
    expect(ev('"  x ".trim().length')).toBe(1)
    expect(ev('"abcdef".slice(1, 3)')).toBe('bc')
    expect(ev('price.toFixed(2)')).toBe('9.50')
    expect(ev('(price * 1.234).round(2)')).toBe(11.72)
    expect(ev('(-2.5).abs().ceil()')).toBe(3)
    expect(ev('list.sort().unique()')).toEqual([1, 2, 3])
    expect(ev('list.filter(value > 1).map(value * 10)')).toEqual([30, 20, 20])
    expect(ev('list.reduce(acc + value, 0)')).toBe(8)
    expect(ev('list.contains(3) && list.containsAll(1, 2) && list.containsAny(9, 2)')).toBe(true)
    expect(ev('[[1, 2], [3]].flat().join("-")')).toBe('1-2-3')
    expect(ev('list.slice(1).reverse()')).toEqual([2, 2, 1])
    expect(ev('list[0]')).toBe(3)
    expect(ev('file.properties.keys().length')).toBeGreaterThan(5)
    expect(ev('file.properties.isEmpty()')).toBe(false)
  })
  it('handles files, links and the any-type methods', () => {
    expect(ev('file.hasTag("sf")')).toBe(true)
    expect(ev('file.hasTag("#book", "nope")')).toBe(true)
    expect(ev('file.hasLink("Herbert")')).toBe(true)
    expect(ev('file.hasProperty("author")')).toBe(true)
    expect(ev('file.inFolder("Books")')).toBe(true)
    expect(ev('file.asLink().path')).toBe('Books/Dune.md')
    expect(ev('link("Herbert").asFile().basename')).toBe('Herbert')
    expect(ev('link("Herbert").linksTo(file("Herbert"))')).toBe(true)
    expect(ev('pages.isType("number") && author.isType("string") && today().isType("date")')).toBe(true)
    expect(ev('"".isTruthy()')).toBe(false)
    expect(ev('pages.toString() + " pages"')).toBe('412 pages')
    expect(ev('missing.isEmpty()')).toBe(true)
  })
  it('compares by type', () => {
    expect(ev('"" == 0')).toBe(false)
    expect(ev('pages == 412')).toBe(true)
    expect(ev('pages == "412"')).toBe(false)
    expect(ev('date(due) == date("2026-10-25")')).toBe(true)
  })
  it('reports unsupported functions', () => {
    expect(() => ev('icon("star")')).toThrow(/not supported/)
    expect(() => ev('nosuch()')).toThrow(/not a function/)
  })
})

// The coverage oracle: every function and file property the references list
// must be implemented or declared unsupported.
describe('coverage of the references', () => {
  it('implements or declares every listed function', async () => {
    const text = await readFile(join(REFS, 'FUNCTIONS_REFERENCE.md'), 'utf8')
    const sections = text.split(/^## /m).slice(1)
    const missing = []
    const listFor = {
      'Global Functions': IMPLEMENTED.functions,
      'Any Type Functions': IMPLEMENTED.any,
      'Date Functions & Fields': IMPLEMENTED.date,
      'String Functions': IMPLEMENTED.string,
      'Number Functions': IMPLEMENTED.number,
      'List Functions': IMPLEMENTED.list,
      'File Functions': IMPLEMENTED.file,
      'Link Functions': IMPLEMENTED.link,
      'Object Functions': IMPLEMENTED.object,
      'Regular Expression Functions': IMPLEMENTED.regexp,
    }
    let checked = 0
    for (const section of sections) {
      const title = section.split('\n')[0].trim()
      const known = listFor[title]
      if (!known) continue
      for (const m of section.matchAll(/^\| `([A-Za-z]+)\(\)`/gm)) {
        checked++
        if (!known.includes(m[1]) && !UNSUPPORTED.functions.includes(m[1])) missing.push(`${title}: ${m[1]}`)
      }
      for (const m of section.matchAll(/`(?:date|duration)\.([a-z]+)`/g)) {
        const fields = title.startsWith('Date') ? IMPLEMENTED.dateFields : IMPLEMENTED.durationFields
        if (title.startsWith('Date') || title.startsWith('Duration')) {
          checked++
          if (!fields.includes(m[1])) missing.push(`${title}: field ${m[1]}`)
        }
      }
    }
    expect(checked).toBeGreaterThan(60)
    expect(missing).toEqual([])
  })
  it('implements or declares every listed file property', async () => {
    const text = await readFile(join(REFS, 'SKILL.md'), 'utf8')
    const props = [...text.matchAll(/^\| `file\.([a-z]+)` \|/gm)].map((m) => m[1])
    expect(props.length).toBeGreaterThan(10)
    expect(props.filter((p) => !IMPLEMENTED.fileProperties.includes(p) && !UNSUPPORTED.fileProperties.includes(p))).toEqual([])
  })
})

describe('renderBase', () => {
  it('renders the Tangents base with file.name as the reference defines it', async () => {
    const index = await vaultIndex()
    const src = await readFile(join(ROOT, 'Tangents', 'Tangents.base'), 'utf8')
    const out = renderBase(src, index.entries(), { basePath: 'Tangents/Tangents.base', resolve: index.resolve, now: NOW })
    expect(out.error).toBeUndefined()
    const [byTarget, byDate] = out.views
    expect(byTarget.columns.map((c) => c.label)).toEqual(['Idea', 'target', 'origin', 'discovered', 'status'])
    // file.name includes the extension, so `file.name != "README"` keeps README.md.
    expect(byTarget.rows.map((r) => r.cells[0].text).sort()).toEqual(['One.md', 'README.md', 'Two.md'])
    expect(byDate.rows.map((r) => r.cells[0].text)).toEqual(['2026-09-20', '2026-09-17', ''])
  })
  it('evaluates formulas per cell, marks errors, and sorts typed values', async () => {
    const index = await vaultIndex()
    const src = await readFile(join(ROOT, 'Bases', 'Formulas.base'), 'utf8')
    const out = renderBase(src, index.entries(), { basePath: 'Bases/Formulas.base', resolve: index.resolve, now: NOW })
    expect(out.error).toBeUndefined()
    const v = out.views[0]
    expect(v.notices).toEqual([])
    expect(v.rows.map((r) => r.cells[0].text)).toEqual(['Alpha', 'Gamma', 'Beta'])
    const byName = Object.fromEntries(v.rows.map((r) => [r.cells[0].text, r.cells]))
    const col = (label) => v.columns.findIndex((c) => c.label === label)
    expect(byName.Alpha[col('Total')].text).toBe('30')
    expect(byName.Beta[col('Total')].t).toBe('error')
    expect(byName.Alpha[col('Days left')].text).toBe('7')
    expect(byName.Alpha[col('Label')].text).toBe('high')
    expect(byName.Gamma[col('Author')].t).toBe('link')
    expect(byName.Alpha[col('Tags')].t).toBe('list')
  })
  it('reports unsupported views, unknown keys, and bad YAML', () => {
    const out = renderBase('views:\n  - type: map\n    name: M\n  - type: cards\n    name: C\nextra: 1\n', [])
    expect(out.views[0].error).toMatch(/not supported$/)
    expect(out.views[1].error).toMatch(/not supported yet/)
    expect(out.notices[0]).toMatch(/extra/)
    expect(renderBase('filters: [', []).error).toMatch(/YAML/)
  })
  it('leaves out and counts entries whose filter fails', () => {
    const entries = [
      { path: 'a.md', frontmatter: { d: '2026-01-01' }, tags: [], links: [], linkTargets: [], embedTargets: [] },
      { path: 'b.md', frontmatter: { d: 'not a date' }, tags: [], links: [], linkTargets: [], embedTargets: [] },
    ]
    const out = renderBase('filters: \'date(d) < now()\'\nviews:\n  - type: table\n    name: T\n', entries, { now: NOW })
    expect(out.views[0].rows.map((r) => r.path)).toEqual(['a.md'])
    expect(out.views[0].notices[0]).toMatch(/1 entry was left out/)
  })
  it('keeps value errors per cell', () => {
    const e = { path: 'a.md', frontmatter: {}, tags: [], links: [], linkTargets: [], embedTargets: [] }
    const out = renderBase('formulas:\n  bad: \'date("x")\'\nviews:\n  - type: table\n    name: T\n    order: [file.name, formula.bad]\n', [e], { now: NOW })
    expect(out.views[0].rows[0].cells.map((c) => c.t)).toEqual(['text', 'error'])
    expect(displayText(new ErrorV('x'))).toBe('x')
  })
})
