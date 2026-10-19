// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Machine-specific application state, kept outside every vault (R6.5).
// legacyDir is the folder the app used before its rename; its state.json is
// read until this one is first written, so recent vaults, tabs and layout
// carry over.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_RECENT = 10

export function createState(dir, legacyDir) {
  const file = join(dir, 'state.json')

  async function readState() {
    try {
      return await readFile(file, 'utf8')
    } catch (err) {
      if (err.code !== 'ENOENT' || !legacyDir) throw err
      return readFile(join(legacyDir, 'state.json'), 'utf8')
    }
  }

  async function load() {
    try {
      const data = JSON.parse(await readState())
      return {
        recentVaults: Array.isArray(data.recentVaults) ? data.recentVaults : [],
        tabs: data.tabs && typeof data.tabs === 'object' && !Array.isArray(data.tabs) ? data.tabs : {},
        layout: data.layout && typeof data.layout === 'object' && !Array.isArray(data.layout) ? data.layout : {},
      }
    } catch {
      return { recentVaults: [], tabs: {}, layout: {} }
    }
  }

  async function save(state) {
    await mkdir(dir, { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
    await rename(tmp, file)
  }

  return {
    async recentVaults() {
      return (await load()).recentVaults
    },
    async addRecentVault(root) {
      const state = await load()
      state.recentVaults = [root, ...state.recentVaults.filter((r) => r !== root)].slice(0, MAX_RECENT)
      await save(state)
      return state.recentVaults
    },
    // Open tabs per vault (R2.5): { list: [vault paths], active: index }.
    // The side drawers (R6.7): { leftOpen, rightOpen, leftWidth, rightWidth }.
    async layout() {
      return (await load()).layout
    },
    async setLayout(layout) {
      const state = await load()
      state.layout = layout
      await save(state)
    },
    // Each tab's history (R2.5.1) is kept alongside it: { back, fwd }, lists
    // of { path, scroll }.
    async tabsFor(root) {
      const t = (await load()).tabs[root]
      if (!t || !Array.isArray(t.list)) return { list: [], active: -1, hist: [] }
      const steps = (a) => (Array.isArray(a) ? a.filter((st) => st && typeof st.path === 'string').map((st) => ({ path: st.path, scroll: Number.isFinite(st.scroll) ? st.scroll : 0 })) : [])
      const pairs = t.list.map((p, i) => [p, t.hist?.[i]]).filter(([p]) => typeof p === 'string')
      return {
        list: pairs.map(([p]) => p),
        active: Number.isInteger(t.active) ? t.active : 0,
        hist: pairs.map(([, h]) => ({ back: steps(h?.back), fwd: steps(h?.fwd) })),
      }
    },
    async setTabsFor(root, tabs) {
      const state = await load()
      state.tabs[root] = { list: tabs.list, active: tabs.active, ...(Array.isArray(tabs.hist) ? { hist: tabs.hist } : {}) }
      await save(state)
    },
    async removeRecentVault(root) {
      const state = await load()
      state.recentVaults = state.recentVaults.filter((r) => r !== root)
      await save(state)
      return state.recentVaults
    },
  }
}
