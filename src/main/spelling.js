// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Spell checking's dictionaries, with nothing fetched (R6.3). macOS checks
// with the system's own dictionaries. Elsewhere Chromium checks with Hunspell
// and would download its dictionaries from Google's servers; instead its
// download address is the app's own dictionary folder, and the English
// dictionary bundled with the Linux packages is put where Chromium looks
// first (its Dictionaries folder), so that it needs no download at all.

import { copyFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Chromium's compiled en-US dictionary, under the name Chromium asks for.
export const DICTIONARY = 'en-US-10-1.bdic'

// session: Electron's session; dictionaryDir: the bundled dictionaries
// (resources/dictionaries in a package, build/dictionaries in development);
// userDataDir: the app's user-data folder.
export async function configureSpelling(session, { platform, dictionaryDir, userDataDir }) {
  if (platform === 'darwin') return
  session.setSpellCheckerDictionaryDownloadURL(pathToFileURL(dictionaryDir).href + '/')
  if (platform !== 'linux') return
  const target = join(userDataDir, 'Dictionaries', DICTIONARY)
  try {
    await stat(target)
  } catch {
    try {
      await mkdir(join(userDataDir, 'Dictionaries'), { recursive: true })
      await copyFile(join(dictionaryDir, DICTIONARY), target)
    } catch {
      // No bundled dictionary (a build without it): spelling goes unchecked.
    }
  }
  session.setSpellCheckerLanguages(['en-US'])
}
