// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { attachmentKind } from '../src/renderer/src/attachments.js'
import { parseStl } from '../src/renderer/src/modelViewer.js'

describe('attachmentKind', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(attachmentKind('a/61HL6syUlXL._SL1180_.jpg')).toBe('image')
    expect(attachmentKind('x.PNG')).toBe('image')
    expect(attachmentKind('doc.pdf')).toBe('pdf')
    expect(attachmentKind('tone.wav')).toBe('audio')
    expect(attachmentKind('clip.mp4')).toBe('video')
    expect(attachmentKind('page.html')).toBe('html')
    expect(attachmentKind('part.stl')).toBe('model')
    expect(attachmentKind('PART.STL')).toBe('model')
    expect(attachmentKind('data.json')).toBe('text')
    expect(attachmentKind('archive.zip')).toBe('other')
  })
})

describe('parseStl', () => {
  it('reads a binary STL', () => {
    const bytes = readFileSync(new URL('./fixtures/vault/attachments/part.stl', import.meta.url))
    const geometry = parseStl(STLLoader, bytes)
    expect(geometry.getAttribute('position').count).toBe(12)
    expect(geometry.boundingBox.max.toArray()).toEqual([10, 10, 10])
  })

  it('reads an ASCII STL', () => {
    const text = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n'
    const geometry = parseStl(STLLoader, new TextEncoder().encode(text))
    expect(geometry.getAttribute('position').count).toBe(3)
  })

  it('refuses bytes that hold no triangles', () => {
    expect(() => parseStl(STLLoader, new TextEncoder().encode('not a model'))).toThrow(/no readable triangles/)
  })
})
