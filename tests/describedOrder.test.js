// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describedList, scanVault } from '../src/main/vault.js'

describe('describedList (R2.2.1)', () => {
  it('reads numbered and bulleted items under Chapters and Notes, in order', () => {
    const text = [
      '# Book',
      'Intro with [[Not listed]].',
      '## Chapters',
      '1. [[00 - First|First]]',
      '2. [[00 - Second]] and a remark',
      '## Notes',
      '- [[Alpha|the alpha note]]',
      '* [[Beta#Section]]',
      '+ [[Gamma.md]]',
      '## Elsewhere',
      '1. [[Ignored]]',
    ].join('\n')
    expect(describedList(text)).toEqual(['00 - First', '00 - Second', 'Alpha', 'Beta', 'Gamma.md'])
  })
  it('takes each item\'s first wikilink only, and skips items without one', () => {
    expect(describedList('## Notes\n1. [[One]] then [[Two]]\n2. plain text\n3. [[Three]]')).toEqual(['One', 'Three'])
  })
  it('finds nothing without a Chapters or Notes heading', () => {
    expect(describedList('## Contents\n1. [[One]]\n### Notes\n1. [[Two]]')).toEqual([])
  })
})

describe('scanVault in described order (R2.2.1)', () => {
  let root
  const names = (entries) => entries.map((e) => e.name)
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scrinotia-order-'))
    const book = join(root, 'Book')
    await mkdir(join(book, 'Zeta chapter'), { recursive: true })
    await mkdir(join(book, 'Alpha chapter'))
    await mkdir(join(book, 'Unlisted folder'))
    for (const n of ['Last note', 'First note', 'Unlisted note', 'image.png']) await writeFile(join(book, n.includes('.') ? n : `${n}.md`), 'x')
    await writeFile(join(book, 'Zeta chapter', '00 - Zeta chapter.md'), 'x')
    await writeFile(join(book, 'Alpha chapter', '00 - Alpha chapter.md'), 'x')
    await writeFile(
      join(book, '00 - Book.md'),
      ['## Chapters', '1. [[00 - Zeta chapter|Zeta]]', '2. [[00 - Alpha chapter]]', '## Notes', '- [[Last note]]', '- [[Missing note]]', '- [[First note]]', '- [[Last note]]'].join('\n'),
    )
    // A folder whose note does not match its name stays alphabetical.
    await mkdir(join(root, 'Loose'))
    await writeFile(join(root, 'Loose', '00 - Other name.md'), '## Notes\n1. [[b]]')
    for (const n of ['a.md', 'b.md']) await writeFile(join(root, 'Loose', n), 'x')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('puts the note, then the list, then the rest with files before folders', async () => {
    const book = (await scanVault(root, { order: 'described' })).find((e) => e.name === 'Book')
    expect(names(book.children)).toEqual(['00 - Book.md', 'Zeta chapter', 'Alpha chapter', 'Last note.md', 'First note.md', 'image.png', 'Unlisted note.md', 'Unlisted folder'])
  })
  it('keeps a folder whose note is not named for it alphabetical', async () => {
    const loose = (await scanVault(root, { order: 'described' })).find((e) => e.name === 'Loose')
    expect(names(loose.children)).toEqual(['00 - Other name.md', 'a.md', 'b.md'])
  })
  it('ignores the lists under Alphabetical', async () => {
    const book = (await scanVault(root, { order: 'alphabetical' })).find((e) => e.name === 'Book')
    expect(names(book.children)).toEqual(['00 - Book.md', 'First note.md', 'image.png', 'Last note.md', 'Unlisted note.md', 'Alpha chapter', 'Unlisted folder', 'Zeta chapter'])
  })
})
