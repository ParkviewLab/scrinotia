// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { extractSection, listHeadings } from '../src/shared/sections.js'

const NOTE = `---
tags: [x]
---
# Title

Intro.

## Goals

First goal.
Second line. ^para1

- item one
- item two ^li2

### Detail

Deep.

\`\`\`
# not a heading
\`\`\`

## Later

Last.`

describe('listHeadings', () => {
  it('lists headings with levels and note line numbers, skipping frontmatter and code', () => {
    expect(listHeadings(NOTE)).toEqual([
      { level: 1, text: 'Title', line: 4 },
      { level: 2, text: 'Goals', line: 8 },
      { level: 3, text: 'Detail', line: 16 },
      { level: 2, text: 'Later', line: 24 },
    ])
  })
})

describe('extractSection', () => {
  it('returns the body without frontmatter', () => {
    expect(extractSection(NOTE, null).startsWith('# Title')).toBe(true)
  })
  it('returns a heading section up to the next heading of the same level', () => {
    const s = extractSection(NOTE, 'Goals')
    expect(s.startsWith('## Goals')).toBe(true)
    expect(s).toContain('### Detail')
    expect(s).not.toContain('## Later')
  })
  it('matches headings case-insensitively and ignores fenced code', () => {
    expect(extractSection(NOTE, 'later')).toBe('## Later\n\nLast.')
    expect(extractSection(NOTE, 'not a heading')).toBeNull()
  })
  it('returns a marked paragraph or list item without its marker', () => {
    expect(extractSection(NOTE, '^para1')).toBe('First goal.\nSecond line.')
    expect(extractSection(NOTE, '^li2')).toBe('- item two')
    expect(extractSection(NOTE, '^missing')).toBeNull()
  })
})
