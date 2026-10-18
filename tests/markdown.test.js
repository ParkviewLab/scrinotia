// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { parseLinks, parseTags, splitLink, detectLineSeparator, vaultParser } from '../src/shared/markdown.js'

describe('parseLinks', () => {
  it('finds wikilinks with subpaths, aliases, and embeds', () => {
    const text = 'See [[Plan]], [[Projects/Plan#Goals|the goals]] and ![[diagram.png]].'
    const links = parseLinks(text)
    expect(links.map((l) => [l.target, l.subpath, l.alias, l.embed])).toEqual([
      ['Plan', null, null, false],
      ['Projects/Plan', 'Goals', 'the goals', false],
      ['diagram.png', null, null, true],
    ])
    expect(text.slice(links[1].targetFrom, links[1].targetTo)).toBe('Projects/Plan#Goals')
  })

  it('ignores links in code', () => {
    const text = 'Inline `[[NotALink]]` here.\n\n```\n[[AlsoNot]]\n```\n\n[[Real]]\n'
    expect(parseLinks(text).map((l) => l.target)).toEqual(['Real'])
  })

  it('finds local markdown links, decoded, and skips URLs', () => {
    const text = '[a](My%20Note.md) [b](https://example.com/x.md) [c](Other.md#Part)'
    expect(parseLinks(text).map((l) => [l.target, l.subpath])).toEqual([
      ['My Note.md', null],
      ['Other.md', 'Part'],
    ])
  })

  it('does not span lines or nest', () => {
    expect(parseLinks('[[broken\nlink]]')).toEqual([])
  })
})

describe('dialect', () => {
  it('parses highlights and comments', () => {
    const names = []
    vaultParser.parse('a ==hi== b %%note%% c').iterate({ enter: (n) => void names.push(n.name) })
    expect(names).toContain('Highlight')
    expect(names).toContain('Comment')
  })
})

describe('parseTags', () => {
  it('finds tags outside code and links, not headings', () => {
    expect(parseTags('# Heading\n\n#idea and #a/b, `#no`, [[#Sub]], #2024')).toEqual(['idea', 'a/b'])
  })
})

describe('helpers', () => {
  it('splits link bodies', () => {
    expect(splitLink('A#B|C')).toEqual({ target: 'A', subpath: 'B', alias: 'C' })
    expect(splitLink('#Local')).toEqual({ target: '', subpath: 'Local', alias: null })
  })
  it('detects line separators', () => {
    expect(detectLineSeparator('a\r\nb')).toBe('\r\n')
    expect(detectLineSeparator('a\nb')).toBe('\n')
    expect(detectLineSeparator('one line')).toBe('\n')
  })
})
