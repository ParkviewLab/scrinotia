// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import { parseLinks, parseTags, splitLink, detectLineSeparator, vaultParser, vaultTags } from '../src/shared/markdown.js'

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

describe('frontmatter', () => {
  const nodes = (text) => {
    const out = []
    vaultParser.parse(text).iterate({ enter: (n) => void out.push(`${n.name} ${n.from}-${n.to}`) })
    return out
  }

  it('is one node at the start of a note, not a rule and a heading', () => {
    const text = '---\ntitle: Alpha\ntags: [a]\n---\n# Body\n'
    const found = nodes(text)
    expect(found).toContain('Frontmatter 0-30')
    expect(found).toContain('FrontmatterContent 4-26')
    expect(found).toContain('FrontmatterMark 27-30')
    expect(found.some((n) => /^(HorizontalRule|SetextHeading)/.test(n))).toBe(false)
    expect(found).toContain('ATXHeading1 31-37')
  })

  it('matches the link index: BOM, CRLF and a ... closer', () => {
    expect(nodes('﻿---\r\na: 1\r\n...\r\nx')).toContain('Frontmatter 0-15')
    expect(nodes('---\n\n---\nx')).toContain('Frontmatter 0-8')
  })

  it('is absent when unclosed, not first, or empty without a blank line', () => {
    for (const text of ['---\ntitle: A\n', 'x\n---\na\n---\n', '---\n---\n', '---x\na\n---\n']) {
      expect(nodes(text).some((n) => n.startsWith('Frontmatter'))).toBe(false)
    }
  })

  it('leaves links and tags in properties as they were', () => {
    const text = '---\nup: "[[Foo]]"\nrelated:\n  - "[[Bar|b]]"\n  - "![[img.png]]"\ntitle: #t1\n---\n[[Body]] #body\n'
    expect(parseLinks(text).map((l) => [l.target, l.alias, l.embed, l.from, l.to])).toEqual([
      ['Foo', null, false, 9, 16],
      ['Bar', 'b', false, 32, 41],
      ['img.png', null, true, 48, 60],
      ['Body', null, false, 77, 85],
    ])
    expect(parseTags(text)).toEqual(['t1', 'body'])
  })
})

describe('highlight tags', () => {
  // The highlight classes a parse gives each piece of text, by tag name.
  const classes = (text) => {
    const highlighter = tagHighlighter([
      { tag: tags.link, class: 'link' },
      { tag: tags.processingInstruction, class: 'mark' },
      { tag: tags.comment, class: 'comment' },
      { tag: vaultTags.alias, class: 'alias' },
      { tag: vaultTags.highlight, class: 'hl' },
    ])
    const out = []
    highlightTree(vaultParser.parse(text), highlighter, (from, to, cls) => out.push([text.slice(from, to), cls]))
    return out
  }

  it('colours wikilinks, embeds, highlights and comments', () => {
    const got = classes('[[Beta|b]] ![[i.png]] ==hi== %%c%%')
    expect(got).toContainEqual(['[[', 'link mark'])
    expect(got).toContainEqual(['Beta', 'link'])
    expect(got).toContainEqual(['b', 'link alias'])
    expect(got).toContainEqual(['i.png', 'link'])
    expect(got).toContainEqual(['hi', 'hl'])
    expect(got).toContainEqual(['==', 'hl mark'])
    expect(got).toContainEqual(['%%c%%', 'comment'])
  })
})
