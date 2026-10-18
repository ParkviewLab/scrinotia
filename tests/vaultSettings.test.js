// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSettings, writeSettings } from '../src/main/vaultSettings.js'

let root
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scrinotia-set-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('vault settings', () => {
  it('reads defaults without creating anything', async () => {
    expect(await readSettings(root, 'appearance')).toEqual({ values: {}, conflicts: [] })
    expect(await readdir(root)).toEqual([])
  })
  it('writes one JSON file per concern and reads it back', async () => {
    await writeSettings(root, 'appearance', { theme: 'light' })
    expect((await readSettings(root, 'appearance')).values).toEqual({ theme: 'light' })
    expect(await readdir(join(root, '.scrinotia'))).toEqual(['appearance.json'])
    expect(await readFile(join(root, '.scrinotia', 'appearance.json'), 'utf8')).toBe('{\n  "theme": "light"\n}\n')
  })
  it('reports synchronisation conflict copies without reading them', async () => {
    await mkdir(join(root, '.scrinotia'))
    await writeFile(join(root, '.scrinotia', 'appearance.json'), '{"theme":"dark"}')
    await writeFile(join(root, '.scrinotia', 'appearance.sync-conflict-20261017-120000-ABCDEF.json'), '{"theme":"light"}')
    const s = await readSettings(root, 'appearance')
    expect(s.values).toEqual({ theme: 'dark' })
    expect(s.conflicts).toEqual(['appearance.sync-conflict-20261017-120000-ABCDEF.json'])
  })
  it('reads a vault\'s settings from .granite-vaulting/ until .scrinotia/ exists', async () => {
    await mkdir(join(root, '.granite-vaulting'))
    await writeFile(join(root, '.granite-vaulting', 'appearance.json'), '{"theme":"light"}')
    await writeFile(join(root, '.granite-vaulting', 'files.json'), '{"attachmentFolder":"media"}')
    expect((await readSettings(root, 'appearance')).values).toEqual({ theme: 'light' })
    expect(await readdir(root)).toEqual(['.granite-vaulting'])
  })
  it('moves .granite-vaulting/ to .scrinotia/ on the first write', async () => {
    await mkdir(join(root, '.granite-vaulting'))
    await writeFile(join(root, '.granite-vaulting', 'files.json'), '{"attachmentFolder":"media"}')
    await writeSettings(root, 'appearance', { theme: 'dark' })
    expect(await readdir(root)).toEqual(['.scrinotia'])
    expect((await readdir(join(root, '.scrinotia'))).sort()).toEqual(['appearance.json', 'files.json'])
    expect((await readSettings(root, 'files')).values).toEqual({ attachmentFolder: 'media' })
  })
  it('prefers .scrinotia/ when both folders exist', async () => {
    await mkdir(join(root, '.granite-vaulting'))
    await writeFile(join(root, '.granite-vaulting', 'appearance.json'), '{"theme":"light"}')
    await mkdir(join(root, '.scrinotia'))
    await writeFile(join(root, '.scrinotia', 'appearance.json'), '{"theme":"dark"}')
    expect((await readSettings(root, 'appearance')).values).toEqual({ theme: 'dark' })
  })
  it('refuses odd names', async () => {
    await expect(writeSettings(root, '../x', {})).rejects.toThrow()
  })
})
