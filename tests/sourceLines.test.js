// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createPreview, splitFrontmatter } from '../src/renderer/src/preview.js'
import { listItemLines, orderedAnchors, topForLine, lineForTop } from '../src/renderer/src/sourceLines.js'

const VAULT = join(import.meta.dirname, 'fixtures', 'vault')
const preview = createPreview({ assetUrl: () => null, resolves: () => true })

function notes(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return notes(path)
    return /\.md$/i.test(name) ? [[path.slice(VAULT.length + 1), readFileSync(path, 'utf8')]] : []
  })
}

const SAMPLE = [
  '---',
  'title: Sample',
  'tags: [a]',
  '---',
  '# Heading',
  '',
  'A paragraph',
  'over two lines. ^para',
  '',
  '- one',
  '- two',
  '  - nested',
  '    1. deep',
  '- three',
  '',
  '1. loose',
  '',
  '2. list',
  '',
  '<details>',
  '',
  'Inside the details.',
  '',
  '</details>',
  '',
  '$$',
  'x^2',
  '$$',
  '',
  '```js',
  'code',
  '',
  'more',
  '```',
  '',
  '| a | b |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '> [!note] Callout',
  '> body',
  '',
  '[ref]: https://example.com',
  'Last [link][ref].',
].join('\n')

const CASES = [['sample', SAMPLE], ['sample, CRLF', SAMPLE.replace(/\n/g, '\r\n')], ...notes(VAULT)]

describe('source lines of the preview (item 13)', () => {
  for (const [name, text] of CASES) {
    describe(name, () => {
      const { html, tokens, starts } = preview.toHtml(text, { lines: true })
      const lines = text.split(/\r?\n/)

      it('renders exactly as without the markers', () => {
        expect(html.replace(/<span data-src-mark="\d+"><\/span>/g, '')).toBe(preview.toHtml(text).html)
      })
      it('has tokens whose raws make up the body', () => {
        const body = splitFrontmatter(text).body.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, '').replace(/\r\n/g, '\n')
        expect(tokens.map((t) => t.raw).join('')).toBe(body)
      })
      it('gives each block its first source line', () => {
        tokens.forEach((t, i) => {
          if (t.type === 'space') return
          expect(lines[starts[i] - 1]).toContain(t.raw.split('\n')[0].trim())
        })
      })
      it("gives each list item its first source line", () => {
        const check = (items) =>
          items.forEach((item) => {
            expect(lines[item.line - 1]).toMatch(/^\s*([-*+]|\d+[.)])\s/)
            item.lists.forEach(check)
          })
        tokens.forEach((t, i) => t.type === 'list' && check(listItemLines(t, starts[i])))
      })
    })
  }

  it('places the sample blocks on their lines', () => {
    const { tokens, starts } = preview.toHtml(SAMPLE, { lines: true })
    const at = (type) => starts[tokens.findIndex((t) => t.type === type)]
    expect(at('heading')).toBe(5)
    expect(at('paragraph')).toBe(7)
    expect(at('mathBlock')).toBe(26)
    expect(at('code')).toBe(30)
    expect(at('table')).toBe(36)
    const list = tokens.findIndex((t) => t.type === 'list')
    const items = listItemLines(tokens[list], starts[list])
    expect(items.map((i) => i.line)).toEqual([10, 11, 14])
    expect(items[1].lists[0][0].line).toBe(12)
    expect(items[1].lists[0][0].lists[0][0].line).toBe(13)
  })
})

describe('matching lines and heights (item 13)', () => {
  const anchors = [
    { line: 1, top: 0 },
    { line: 5, top: 100 },
    { line: 6, top: 500 },
    { line: 20, top: 640 },
  ]
  it('interpolates between anchors, both ways', () => {
    expect(topForLine(anchors, 3)).toBe(50)
    expect(topForLine(anchors, 5.5)).toBe(300)
    expect(lineForTop(anchors, 300)).toBe(5.5)
    expect(lineForTop(anchors, 570)).toBe(13)
  })
  it('holds to the ends', () => {
    expect(topForLine(anchors, 0)).toBe(0)
    expect(topForLine(anchors, 99)).toBe(640)
    expect(lineForTop(anchors, -10)).toBe(1)
    expect(lineForTop(anchors, 9999)).toBe(20)
  })
  it('copes with one anchor, none, and equal heights', () => {
    expect(topForLine([{ line: 3, top: 40 }], 10)).toBe(40)
    expect(lineForTop([], 10)).toBe(1)
    expect(topForLine([], 4)).toBe(0)
    const flat = [{ line: 2, top: 10 }, { line: 4, top: 10 }, { line: 9, top: 60 }]
    expect(lineForTop(flat, 10)).toBe(2)
    expect(lineForTop(flat, 30)).toBe(6)
  })
  it('leaves out anchors that run backwards or repeat a line', () => {
    expect(orderedAnchors([{ line: 1, top: 0 }, { line: 4, top: 80 }, { line: 3, top: 90 }, { line: 4, top: 95 }, { line: 7, top: 60 }, { line: 9, top: 200 }])).toEqual([
      { line: 1, top: 0 },
      { line: 4, top: 80 },
      { line: 9, top: 200 },
    ])
  })
})
