// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { diskConflict } from '../src/renderer/src/conflicts.js'

describe('the deferred conflict check (item 18, R1.5)', () => {
  it('offers the disk text when unsaved edits meet a changed file', () => {
    expect(diskConflict({ dirty: true, disk: 'before' }, 'changed elsewhere')).toBe('changed elsewhere')
  })
  it('finds none when the file is as last read or written', () => {
    expect(diskConflict({ dirty: true, disk: 'before' }, 'before')).toBeNull()
  })
  it('finds none without unsaved edits, or without the disk text', () => {
    expect(diskConflict({ dirty: false, disk: 'before' }, 'changed')).toBeNull()
    expect(diskConflict({ dirty: true, disk: 'before' }, null)).toBeNull()
    expect(diskConflict(undefined, 'changed')).toBeNull()
  })
})
