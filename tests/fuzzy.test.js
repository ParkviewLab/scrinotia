// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { fuzzyRank, fuzzyScore } from '../src/renderer/src/fuzzy.js'

const PATHS = ['Welcome.md', 'Ideas.md', 'Projects/Plan.md', 'Projects/Archive/Plan.md', 'Plan notes.md', 'Bases/Alpha.md', 'Daily/2026-10-18.md']

describe('fuzzy matching', () => {
  it('requires the characters in order', () => {
    expect(fuzzyScore('wlc', 'Welcome')).not.toBeNull()
    expect(fuzzyScore('clw', 'Welcome')).toBeNull()
  })
  it('ranks whole-word and file-name matches first', () => {
    expect(fuzzyRank('plan', PATHS).slice(0, 3)).toEqual(['Projects/Plan.md', 'Projects/Archive/Plan.md', 'Plan notes.md'])
    expect(fuzzyRank('alp', PATHS)[0]).toBe('Bases/Alpha.md')
    expect(fuzzyRank('2026', PATHS)).toEqual(['Daily/2026-10-18.md'])
  })
  it('ignores spaces in the query', () => {
    expect(fuzzyRank('plan notes', PATHS)[0]).toBe('Plan notes.md')
  })
})
