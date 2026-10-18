// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { normaliseColour, colourCss, DEFAULT_MODEL_COLOUR } from '../src/renderer/src/modelViewer.js'

describe('STL model colour (R6.8)', () => {
  it('keeps a valid stored colour, rounded to whole units', () => {
    expect(normaliseColour({ h: 30.4, s: 80, l: 55.6 })).toEqual({ h: 30, s: 80, l: 56 })
  })
  it('falls back to the default for a missing or malformed value', () => {
    for (const bad of [undefined, null, {}, { h: 400, s: 50, l: 50 }, { h: 10, s: -1, l: 50 }, { h: '10', s: 50, l: 50 }, { h: 10, s: 50, l: NaN }]) {
      expect(normaliseColour(bad)).toEqual(DEFAULT_MODEL_COLOUR)
    }
  })
  it('returns a copy, so the default cannot be changed through it', () => {
    normaliseColour(null).h = 0
    expect(DEFAULT_MODEL_COLOUR.h).toBe(225)
  })
  it('writes the CSS form used by the swatch', () => {
    expect(colourCss({ h: 225, s: 40, l: 62 })).toBe('hsl(225, 40%, 62%)')
  })
})
