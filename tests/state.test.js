// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createState } from '../src/main/state.js'

let base, dir, legacy
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'scrinotia-state-'))
  dir = join(base, 'Scrinotia')
  legacy = join(base, 'granite-vaulting')
})
afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('machine state', () => {
  it('starts empty when neither folder has state', async () => {
    const state = createState(dir, legacy)
    expect(await state.recentVaults()).toEqual([])
    expect(await state.tabsFor('/v')).toEqual({ list: [], active: -1 })
  })
  it('reads the state left by the app before its rename', async () => {
    await mkdir(legacy)
    await writeFile(join(legacy, 'state.json'), JSON.stringify({ recentVaults: ['/v'], tabs: { '/v': { list: ['a.md'], active: 0 } }, layout: { leftOpen: false } }))
    const state = createState(dir, legacy)
    expect(await state.recentVaults()).toEqual(['/v'])
    expect(await state.tabsFor('/v')).toEqual({ list: ['a.md'], active: 0 })
    expect(await state.layout()).toEqual({ leftOpen: false })
  })
  it('writes to the new folder and reads it from then on, leaving the old one alone', async () => {
    await mkdir(legacy)
    await writeFile(join(legacy, 'state.json'), JSON.stringify({ recentVaults: ['/v'] }))
    const state = createState(dir, legacy)
    await state.addRecentVault('/w')
    expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).recentVaults).toEqual(['/w', '/v'])
    await state.removeRecentVault('/v')
    expect(await state.recentVaults()).toEqual(['/w'])
    expect(await readdir(legacy)).toEqual(['state.json'])
  })
})
