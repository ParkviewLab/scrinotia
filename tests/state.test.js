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
  it('keeps workspace recognition off until it is turned on (R2.8)', async () => {
    const state = createState(dir, legacy)
    expect(await state.prefs()).toEqual({ workspaces: false })
    await state.setPrefs({ workspaces: true })
    expect(await createState(dir, legacy).prefs()).toEqual({ workspaces: true })
    expect(await state.recentVaults()).toEqual([])
  })
  it('keeps each tab\'s history with the tabs (R2.5.1)', async () => {
    const state = createState(dir, legacy)
    const hist = [{ back: [{ path: 'a.md', scroll: 120 }], fwd: [{ path: 'c.md', scroll: 0 }] }, { back: [], fwd: [] }]
    await state.setTabsFor('/v', { list: ['b.md', 'd.md'], active: 0, hist })
    expect(await state.tabsFor('/v')).toEqual({ list: ['b.md', 'd.md'], active: 0, hist })
  })
  it('reads tabs saved before histories as having none', async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'state.json'), JSON.stringify({ tabs: { '/v': { list: ['a.md', 'b.md'], active: 1 } } }))
    expect(await createState(dir).tabsFor('/v')).toEqual({ list: ['a.md', 'b.md'], active: 1, hist: [{ back: [], fwd: [] }, { back: [], fwd: [] }] })
  })
  it('starts empty when neither folder has state', async () => {
    const state = createState(dir, legacy)
    expect(await state.recentVaults()).toEqual([])
    expect(await state.tabsFor('/v')).toEqual({ list: [], active: -1, hist: [] })
  })
  it('reads the state left by the app before its rename', async () => {
    await mkdir(legacy)
    await writeFile(join(legacy, 'state.json'), JSON.stringify({ recentVaults: ['/v'], tabs: { '/v': { list: ['a.md'], active: 0 } }, layout: { leftOpen: false } }))
    const state = createState(dir, legacy)
    expect(await state.recentVaults()).toEqual(['/v'])
    expect(await state.tabsFor('/v')).toEqual({ list: ['a.md'], active: 0, hist: [{ back: [], fwd: [] }] })
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
