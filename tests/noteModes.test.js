// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { nextMode, clampShare, DEFAULT_SHARE } from '../src/renderer/src/noteModes.js'

describe('note modes (item 15)', () => {
  it('cycles Preview, Edit (split) and Source', () => {
    expect(nextMode('preview')).toBe('split')
    expect(nextMode('split')).toBe('source')
    expect(nextMode('source')).toBe('preview')
  })
})

describe("the divider's share (item 15)", () => {
  it('keeps a share that leaves both sides their room', () => {
    expect(clampShare(0.3, 1000)).toBe(0.3)
  })
  it('keeps each side at least 240 px', () => {
    expect(clampShare(0.1, 1000)).toBe(0.24)
    expect(clampShare(0.95, 1000)).toBe(0.76)
  })
  it('halves an area narrower than both minimums', () => {
    expect(clampShare(0.2, 400)).toBe(0.5)
  })
  it('falls back to half without a width or a share', () => {
    expect(clampShare(0.3, 0)).toBe(DEFAULT_SHARE)
    expect(clampShare(NaN, 1000)).toBe(DEFAULT_SHARE)
  })
})
