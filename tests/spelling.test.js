// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { configureSpelling, DICTIONARY } from '../src/main/spelling.js'

let dir
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scrinotia-spelling-'))
  await mkdir(join(dir, 'bundled'))
  await writeFile(join(dir, 'bundled', DICTIONARY), 'BDIC')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

function fakeSession() {
  const calls = []
  return {
    calls,
    setSpellCheckerDictionaryDownloadURL: (url) => calls.push(['url', url]),
    setSpellCheckerLanguages: (langs) => calls.push(['languages', langs]),
  }
}

describe('spelling dictionaries (R6.3)', () => {
  it('leaves macOS to the system dictionaries', async () => {
    const session = fakeSession()
    await configureSpelling(session, { platform: 'darwin', dictionaryDir: join(dir, 'bundled'), userDataDir: join(dir, 'user') })
    expect(session.calls).toEqual([])
  })

  it('on Linux puts the bundled dictionary where Chromium looks, and downloads from the app only', async () => {
    const session = fakeSession()
    await configureSpelling(session, { platform: 'linux', dictionaryDir: join(dir, 'bundled'), userDataDir: join(dir, 'user') })
    expect(session.calls).toEqual([
      ['url', pathToFileURL(join(dir, 'bundled')).href + '/'],
      ['languages', ['en-US']],
    ])
    expect(await readFile(join(dir, 'user', 'Dictionaries', DICTIONARY), 'utf8')).toBe('BDIC')
  })

  it('keeps a dictionary already in place, and survives a build without one', async () => {
    await mkdir(join(dir, 'user', 'Dictionaries'), { recursive: true })
    await writeFile(join(dir, 'user', 'Dictionaries', DICTIONARY), 'KEPT')
    await configureSpelling(fakeSession(), { platform: 'linux', dictionaryDir: join(dir, 'bundled'), userDataDir: join(dir, 'user') })
    expect(await readFile(join(dir, 'user', 'Dictionaries', DICTIONARY), 'utf8')).toBe('KEPT')
    await expect(
      configureSpelling(fakeSession(), { platform: 'linux', dictionaryDir: join(dir, 'none'), userDataDir: join(dir, 'other') }),
    ).resolves.toBe(undefined)
  })

  it('elsewhere points any download at the app’s own folder', async () => {
    const session = fakeSession()
    await configureSpelling(session, { platform: 'win32', dictionaryDir: join(dir, 'bundled'), userDataDir: join(dir, 'user') })
    expect(session.calls).toEqual([['url', pathToFileURL(join(dir, 'bundled')).href + '/']])
  })
})
