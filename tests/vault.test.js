// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cp, mkdtemp, rm, readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  scanVault,
  resolveInside,
  readNote,
  writeNote,
  createNote,
  writeAttachment,
  importFile,
  createFolder,
  move,
  trash,
} from '../src/main/vault.js'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'vault')
let root

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scrinotia-'))
  await cp(FIXTURE, root, { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function flatten(tree) {
  return tree.flatMap((e) => [e.path, ...(e.children ? flatten(e.children) : [])])
}

describe('scanVault', () => {
  it('lists files first, then folders, each by name, and hides dot-entries', async () => {
    const tree = await scanVault(root)
    expect(tree.map((e) => e.name)).toEqual(['Attachments.md', 'BOM note.md', 'Dashboard.md', 'Embeds.md', 'Ideas.md', 'Math and diagrams.md', 'No newline.md', 'Welcome.md', 'Windows note.md', 'attachments', 'Bases', 'Embeds', 'Projects', 'Tangents'])
    expect(flatten(tree)).not.toContain('.obsidian')
    expect(flatten(tree)).toContain('Projects/Archive/Plan.md')
  })

  it('sorts notes, bases and attachments together by name', async () => {
    const bases = (await scanVault(root)).find((e) => e.name === 'Bases').children
    const files = bases.filter((e) => e.type !== 'folder').map((e) => e.name)
    expect(files).toEqual([...files].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true })))
    expect(new Set(bases.filter((e) => e.type !== 'folder').map((e) => e.type)).size).toBeGreaterThan(1)
  })

  it('classifies notes and attachments', async () => {
    const tree = await scanVault(root)
    const att = tree.find((e) => e.name === 'attachments').children[0]
    expect(att.type).toBe('attachment')
    expect(tree.find((e) => e.name === 'Welcome.md').type).toBe('note')
  })

  it('writes nothing', async () => {
    const before = (await stat(join(root, 'Welcome.md'))).mtimeMs
    await scanVault(root)
    expect((await stat(join(root, 'Welcome.md'))).mtimeMs).toBe(before)
  })
})

describe('resolveInside', () => {
  it('refuses paths outside the vault', () => {
    expect(() => resolveInside(root, '../etc/passwd')).toThrow()
    expect(() => resolveInside(root, '/etc/passwd')).toThrow()
  })
  it('refuses hidden paths', () => {
    expect(() => resolveInside(root, '.obsidian/app.json')).toThrow()
  })
  it('accepts paths inside', () => {
    expect(resolveInside(root, 'Projects/Plan.md')).toBe(join(root, 'Projects', 'Plan.md'))
  })
})

describe('note operations', () => {
  it('reads and writes atomically, leaving no temporary file', async () => {
    await writeNote(root, 'Ideas.md', 'new text\r\n')
    expect(await readNote(root, 'Ideas.md')).toBe('new text\r\n')
    expect((await readdir(root)).filter((n) => n.endsWith('.scrinotia-tmp'))).toEqual([])
  })

  it('creates notes and folders under free names', async () => {
    expect(await createNote(root, '')).toBe('Untitled.md')
    expect(await createNote(root, '')).toBe('Untitled 1.md')
    expect(await createFolder(root, 'Projects')).toBe('Projects/New folder')
  })

  it('moves without overwriting', async () => {
    await expect(move(root, 'Ideas.md', 'Welcome.md')).rejects.toThrow()
    expect(await move(root, 'Ideas.md', 'Projects/Ideas.md')).toBe('Projects/Ideas.md')
    expect(await readFile(join(root, 'Projects', 'Ideas.md'), 'utf8')).toContain('# Ideas')
  })

  it('writes pasted bytes under a free name, creating the folder', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const name = 'Pasted image 2026-10-22 101500'
    expect(await writeAttachment(root, 'pasted', name, '.png', bytes)).toBe(`pasted/${name}.png`)
    expect(await writeAttachment(root, 'pasted', name, '.png', bytes)).toBe(`pasted/${name} 1.png`)
    expect(await readFile(join(root, 'pasted', `${name}.png`))).toEqual(bytes)
  })

  it('hands deletion to the trash function', async () => {
    const trashed = []
    await trash(root, 'Ideas.md', async (p) => trashed.push(p))
    expect(trashed).toEqual([join(root, 'Ideas.md')])
  })
})

describe('files dropped on a folder (R2.9)', () => {
  let outside
  beforeEach(async () => {
    outside = await mkdtemp(join(tmpdir(), 'scrinotia-outside-'))
  })
  afterEach(async () => {
    await rm(outside, { recursive: true, force: true })
  })

  it('copies a file of any type into the folder, leaving the original', async () => {
    const pdf = join(outside, 'Report.pdf')
    const zip = join(outside, 'data.zip')
    await writeFile(pdf, 'pdf bytes')
    await writeFile(zip, 'zip bytes')
    expect(await importFile(root, pdf, 'Projects')).toBe('Projects/Report.pdf')
    expect(await importFile(root, zip, 'Projects')).toBe('Projects/data.zip')
    expect(await readFile(join(root, 'Projects', 'Report.pdf'), 'utf8')).toBe('pdf bytes')
    expect(await readFile(pdf, 'utf8')).toBe('pdf bytes')
  })

  it('numbers the name when it is taken, never overwriting', async () => {
    const note = join(outside, 'Plan.md')
    await writeFile(note, 'fresh')
    const rel = await importFile(root, note, 'Projects/Archive')
    expect(rel).not.toBe('Projects/Archive/Plan.md')
    expect(rel.startsWith('Projects/Archive/Plan')).toBe(true)
    expect(await readFile(join(root, 'Projects', 'Archive', 'Plan.md'), 'utf8')).not.toBe('fresh')
    expect(await readFile(join(root, rel), 'utf8')).toBe('fresh')
  })

  it('copies to the vault root when the folder is empty', async () => {
    const file = join(outside, 'loose.txt')
    await writeFile(file, 'x')
    expect(await importFile(root, file, '')).toBe('loose.txt')
  })

  it('refuses a folder by name, copying nothing', async () => {
    const dir = join(outside, 'Photos')
    await mkdir(dir)
    await writeFile(join(dir, 'a.png'), 'x')
    await expect(importFile(root, dir, 'Projects')).rejects.toThrow('"Photos" is a folder; only files are copied')
    expect(flatten(await scanVault(root))).not.toContain('Projects/Photos')
  })

  it('refuses a destination outside the vault', async () => {
    const file = join(outside, 'x.txt')
    await writeFile(file, 'x')
    await expect(importFile(root, file, '../elsewhere')).rejects.toThrow(/outside the vault/)
  })
})
