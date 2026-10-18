// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Machine-specific application state, kept outside every vault (R6.5).

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_RECENT = 10

export function createState(dir) {
  const file = join(dir, 'state.json')

  async function load() {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'))
      return { recentVaults: Array.isArray(data.recentVaults) ? data.recentVaults : [] }
    } catch {
      return { recentVaults: [] }
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
    async removeRecentVault(root) {
      const state = await load()
      state.recentVaults = state.recentVaults.filter((r) => r !== root)
      await save(state)
      return state.recentVaults
    },
  }
}
