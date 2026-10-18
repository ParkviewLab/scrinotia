// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { attachmentKind } from '../src/renderer/src/attachments.js'

describe('attachmentKind', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(attachmentKind('a/61HL6syUlXL._SL1180_.jpg')).toBe('image')
    expect(attachmentKind('x.PNG')).toBe('image')
    expect(attachmentKind('doc.pdf')).toBe('pdf')
    expect(attachmentKind('tone.wav')).toBe('audio')
    expect(attachmentKind('clip.mp4')).toBe('video')
    expect(attachmentKind('page.html')).toBe('html')
    expect(attachmentKind('data.json')).toBe('text')
    expect(attachmentKind('archive.zip')).toBe('other')
  })
})
