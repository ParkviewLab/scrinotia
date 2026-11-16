// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { PATH_TYPE, FOLDER_TYPE, dragData, noteAccepts, treeDrop } from '../src/renderer/src/dragTypes.js'

describe('drag types (R2.7)', () => {
  it('marks a folder with a second type, keeping its path for the tree', () => {
    expect(dragData('Projects', true)).toEqual({ [PATH_TYPE]: 'Projects', [FOLDER_TYPE]: 'Projects' })
    expect(dragData('Welcome.md', false)).toEqual({ [PATH_TYPE]: 'Welcome.md' })
  })
  it('lets a note take a vault file or files from outside', () => {
    expect(noteAccepts([PATH_TYPE])).toBe(true)
    expect(noteAccepts(['Files'])).toBe(true)
  })
  it('refuses a folder from the tree', () => {
    expect(noteAccepts(Object.keys(dragData('Projects', true)))).toBe(false)
  })
  it('refuses anything else', () => {
    expect(noteAccepts(['text/plain'])).toBe(false)
    expect(noteAccepts(undefined)).toBe(false)
  })
})

describe('drops on the file tree (R2.9)', () => {
  it('moves a row dragged within the tree', () => {
    expect(treeDrop(Object.keys(dragData('Welcome.md', false)))).toBe('move')
    expect(treeDrop(Object.keys(dragData('Projects', true)))).toBe('move')
  })
  it('copies files from outside the vault', () => {
    expect(treeDrop(['Files'])).toBe('copy')
  })
  it('ignores anything else', () => {
    expect(treeDrop(['text/plain'])).toBe(null)
    expect(treeDrop(undefined)).toBe(null)
  })
})
