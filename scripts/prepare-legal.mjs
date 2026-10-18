// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
//
// prepare-legal.mjs — assemble the packaged legal/ notice bundle.
//
// Recreates legal/ and copies in the project's own license texts plus Electron's
// own Chromium/Node third-party notices. electron-builder DELETES
// LICENSES.chromium.html from the macOS .app (and only leaves it next-to-binary
// on Win/Linux), so we ship our own copy for one stable, cross-platform path.
// The npm-dependency notices (THIRD-PARTY-NOTICES.txt) and the structured list
// (oss-licenses.json) are produced by the `legal:notices` / `legal:list` npm
// scripts; this file only does fs copies so it stays dependency-free.
//
// legal/ is gitignored — it is a build artifact, regenerated before packaging.

import { rm, mkdir, copyFile, cp } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const legal = join(root, 'legal')
const electronDist = join(root, 'node_modules', 'electron', 'dist')

await rm(legal, { recursive: true, force: true })
await mkdir(legal, { recursive: true })

// Project license texts.
await copyFile(join(root, 'LICENSE'), join(legal, 'LICENSE.txt'))
await copyFile(join(root, 'LICENSING.md'), join(legal, 'LICENSING.md'))
await cp(join(root, 'LICENSES'), join(legal, 'LICENSES'), { recursive: true })

// Electron's bundled Chromium/Node notices (electron-builder drops LICENSES.chromium.html from
// the mac .app, so we ship our own copy). These come from node_modules/electron/dist. electron 43
// ships no install script, so `npm ci` does not extract the prebuilt; dist is filled lazily on
// first require, which this script never does (it reads dist directly). The packaging workflows
// run `node node_modules/electron/install.js` before this to populate dist. We assert both notice
// files are present and the Chromium notices are non-trivial, so a missing or incomplete dist
// fails the build loudly here instead of silently shipping empty notices.
const chromiumNotices = join(electronDist, 'LICENSES.chromium.html')
const electronLicense = join(electronDist, 'LICENSE')
if (!existsSync(chromiumNotices) || statSync(chromiumNotices).size < 1_000_000 || !existsSync(electronLicense)) {
  console.error(
    'electron dist is missing or incomplete: node_modules/electron/dist has no (or truncated) ' +
      'license notices. electron 43 does not extract its prebuilt during `npm ci`; run ' +
      '`node node_modules/electron/install.js` first (the release workflows do).',
  )
  process.exit(1)
}
await copyFile(chromiumNotices, join(legal, 'LICENSES.chromium.html'))
await copyFile(electronLicense, join(legal, 'LICENSE.electron.txt'))

console.log('legal/ prepared (project licenses + Electron Chromium/Node notices)')
