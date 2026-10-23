// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { printTitle, printable } from '../src/renderer/src/printing.js'

describe('printing the open note (R3.9)', () => {
  it("titles the page with the note's name", () => {
    expect(printTitle('Projects/Plan.md')).toBe('Plan')
    expect(printTitle('Welcome.MD')).toBe('Welcome')
    expect(printTitle('Daily/2026-10-18.md')).toBe('2026-10-18')
  })
  it('prints a note, not a base or an attachment', () => {
    expect(printable('note')).toBe(true)
    expect(printable('base')).toBe(false)
    expect(printable(undefined)).toBe(false)
  })
})
