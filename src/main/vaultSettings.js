// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vault-level settings (R6.4): small JSON files, one per concern, in
// .scrinotia/ at the vault root, so a file-synchronisation tool carries
// them between machines. The folder is created on the first write only, never
// on opening a vault (R1.1). A synchronisation conflict copy is ignored and
// reported, never read.
//
// Vaults set up before the rename keep their settings in .granite-vaulting/.
// Until .scrinotia/ exists that folder is read, and the first write renames it
// to .scrinotia/, so the settings move once and with the vault.

import { readFile, readdir, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const SETTINGS_DIR = '.scrinotia'
export const LEGACY_SETTINGS_DIR = '.granite-vaulting'
const NAME = /^[a-z][a-z0-9-]*$/

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// The folder settings are read from: .scrinotia/, or the legacy folder while
// only that exists.
async function readDir(root) {
  if (!(await isDir(join(root, SETTINGS_DIR))) && (await isDir(join(root, LEGACY_SETTINGS_DIR)))) {
    return join(root, LEGACY_SETTINGS_DIR)
  }
  return join(root, SETTINGS_DIR)
}

function checkName(name) {
  if (!NAME.test(name)) throw new Error(`bad settings name: ${name}`)
}

export async function readSettings(root, name) {
  checkName(name)
  const dir = await readDir(root)
  let values = {}
  try {
    const data = JSON.parse(await readFile(join(dir, `${name}.json`), 'utf8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) values = data
  } catch {
    // absent or unreadable: defaults apply
  }
  let conflicts = []
  try {
    conflicts = (await readdir(dir)).filter((f) => f.startsWith(`${name}.`) && f.includes('conflict'))
  } catch {
    // no settings folder yet
  }
  return { values, conflicts }
}

export async function writeSettings(root, name, values) {
  checkName(name)
  const dir = join(root, SETTINGS_DIR)
  const legacy = join(root, LEGACY_SETTINGS_DIR)
  if (!(await isDir(dir)) && (await isDir(legacy))) await rename(legacy, dir)
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${name}.json`)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(values, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}
