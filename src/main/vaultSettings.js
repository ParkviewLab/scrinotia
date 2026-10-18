// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vault-level settings (R6.4): small JSON files, one per concern, in
// .granite-vaulting/ at the vault root, so a file-synchronisation tool carries
// them between machines. The folder is created on the first write only, never
// on opening a vault (R1.1). A synchronisation conflict copy is ignored and
// reported, never read.

import { readFile, readdir, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const SETTINGS_DIR = '.granite-vaulting'
const NAME = /^[a-z][a-z0-9-]*$/

function fileOf(root, name) {
  if (!NAME.test(name)) throw new Error(`bad settings name: ${name}`)
  return join(root, SETTINGS_DIR, `${name}.json`)
}

export async function readSettings(root, name) {
  let values = {}
  try {
    const data = JSON.parse(await readFile(fileOf(root, name), 'utf8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) values = data
  } catch {
    // absent or unreadable: defaults apply
  }
  let conflicts = []
  try {
    conflicts = (await readdir(join(root, SETTINGS_DIR))).filter((f) => f.startsWith(`${name}.`) && f.includes('conflict'))
  } catch {
    // no settings folder yet
  }
  return { values, conflicts }
}

export async function writeSettings(root, name, values) {
  const file = fileOf(root, name)
  await mkdir(join(root, SETTINGS_DIR), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(values, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}
