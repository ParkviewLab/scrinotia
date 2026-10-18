// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { resolveLink, resolveRelative } from '../src/shared/links.js'

const files = ['Welcome.md', 'Ideas.md', 'Projects/Plan.md', 'Projects/Archive/Plan.md', 'attachments/diagram.png', 'Plan notes.md']

describe('resolveLink', () => {
  it('matches by name, case-insensitively, with or without .md', () => {
    expect(resolveLink('welcome', 'Ideas.md', files)).toBe('Welcome.md')
    expect(resolveLink('Ideas.md', 'Welcome.md', files)).toBe('Ideas.md')
  })
  it('prefers the linking note’s folder, then the shortest path', () => {
    expect(resolveLink('Plan', 'Projects/Archive/Plan.md', files)).toBe('Projects/Archive/Plan.md')
    expect(resolveLink('Plan', 'Welcome.md', files)).toBe('Projects/Plan.md')
  })
  it('matches path suffixes when the target has a folder', () => {
    expect(resolveLink('Archive/Plan', 'Welcome.md', files)).toBe('Projects/Archive/Plan.md')
  })
  it('resolves attachments by full name', () => {
    expect(resolveLink('diagram.png', 'Welcome.md', files)).toBe('attachments/diagram.png')
  })
  it('returns null for unresolved targets', () => {
    expect(resolveLink('Missing', 'Welcome.md', files)).toBeNull()
    expect(resolveLink('', 'Welcome.md', files)).toBeNull()
  })
})

describe('resolveRelative', () => {
  it('resolves against the linking note’s folder', () => {
    expect(resolveRelative('../Ideas.md', 'Projects/Plan.md', files)).toBe('Ideas.md')
    expect(resolveRelative('Archive/Plan.md', 'Projects/Plan.md', files)).toBe('Projects/Archive/Plan.md')
  })
})
