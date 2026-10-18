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
    async tabsFor(root) {
      const t = (await load()).tabs[root]
      return t && Array.isArray(t.list) ? { list: t.list.filter((p) => typeof p === 'string'), active: Number.isInteger(t.active) ? t.active : 0 } : { list: [], active: -1 }
    },
    async setTabsFor(root, tabs) {
      const state = await load()
      state.tabs[root] = { list: tabs.list, active: tabs.active }
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
