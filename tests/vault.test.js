// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cp, mkdtemp, rm, readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  scanVault,
  resolveInside,
  readNote,
  writeNote,
  createNote,
  createFolder,
  move,
  trash,
} from '../src/main/vault.js'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'vault')
let root

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gv-'))
  await cp(FIXTURE, root, { recursive: true })
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function flatten(tree) {
  return tree.flatMap((e) => [e.path, ...(e.children ? flatten(e.children) : [])])
}

describe('scanVault', () => {
  it('lists folders first, then files, and hides dot-entries', async () => {
    const tree = await scanVault(root)
    expect(tree.map((e) => e.name)).toEqual(['attachments', 'Projects', 'Ideas.md', 'Welcome.md'])
    expect(flatten(tree)).not.toContain('.obsidian')
    expect(flatten(tree)).toContain('Projects/Archive/Plan.md')
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
    expect((await readdir(root)).filter((n) => n.endsWith('.gv-tmp'))).toEqual([])
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

  it('hands deletion to the trash function', async () => {
    const trashed = []
    await trash(root, 'Ideas.md', async (p) => trashed.push(p))
    expect(trashed).toEqual([join(root, 'Ideas.md')])
  })
})
