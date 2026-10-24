// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWorkspace, scanWorkspace, repositoriesIn, inWorkspace } from '../src/main/workspace.js'

// Built in a temporary folder: git cannot commit a .git folder or file, so a
// fixture of the layout cannot live in the repository.
async function put(root, rel, text = '') {
  const full = join(root, rel)
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, text)
}

async function repo(root, name, worktrees) {
  await mkdir(join(root, name, `${name}.git`), { recursive: true })
  for (const wt of worktrees) await put(root, `${name}/${name}-${wt}/.git`, `gitdir: ../${name}.git/worktrees/${wt}\n`)
}

let ws
let vault
beforeAll(async () => {
  ws = await mkdtemp(join(tmpdir(), 'scrinotia-ws-'))
  await repo(ws, 'alpha', ['main', 'develop', 'doc-spec'])
  await put(ws, 'alpha/alpha-main/README.md', '# Alpha\n\nSee [[guide]].\n')
  await put(ws, 'alpha/alpha-main/CHANGELOG.md', '# Changelog\n')
  await put(ws, 'alpha/alpha-main/package.json', '{}')
  await put(ws, 'alpha/alpha-main/src/index.js', '')
  await put(ws, 'alpha/alpha-main/src/notes.md', '# Not shown\n')
  await put(ws, 'alpha/alpha-main/docs/guide.md', '# Guide\n')
  await put(ws, 'alpha/alpha-main/docs/northstar.html', '<title>Northstar</title><p>Intent</p>')
  await put(ws, 'alpha/alpha-main/docs/img/diagram.png', 'png')
  await put(ws, 'alpha/alpha-main/docs/deep/er/notes.md', '# Deep\n')
  await put(ws, 'alpha/alpha-main/docs/data.json', '{}')
  await put(ws, 'alpha/alpha-develop/README.md', '# Alpha (develop)\n')
  await repo(ws, 'beta.ai', ['live', 'staging'])
  await put(ws, 'beta.ai/beta.ai-live/README.md', '# Beta\n')
  await mkdir(join(ws, 'node_modules', 'left-pad'), { recursive: true })
  await put(ws, 'loose-notes.md', '# Loose\n')
  await put(ws, 'archive.bundle', '')

  vault = await mkdtemp(join(tmpdir(), 'scrinotia-vault-'))
  await put(vault, 'Welcome.md', '# Welcome\n')
  await mkdir(join(vault, 'Notes'), { recursive: true })
  await mkdir(join(vault, 'Projects'), { recursive: true })
  await repo(vault, 'cloned', ['main'])
})
afterAll(async () => {
  await rm(ws, { recursive: true, force: true })
  await rm(vault, { recursive: true, force: true })
})

const names = (nodes) => nodes.map((n) => n.name)
const find = (nodes, name) => nodes.find((n) => n.name === name)

describe('workspace detection (R2.8)', () => {
  it('recognises a folder of repositories', async () => {
    expect(await isWorkspace(ws)).toBe(true)
  })
  it('leaves an ordinary vault with one cloned repository alone', async () => {
    expect(await isWorkspace(vault)).toBe(false)
  })
  it('finds each repository and its worktrees, ignoring other folders', async () => {
    const repos = await repositoriesIn(ws)
    expect(repos.map((r) => r.name)).toEqual(['alpha', 'beta.ai'])
    expect(repos[0].worktrees.map((w) => w.suffix)).toEqual(['develop', 'doc-spec', 'main'])
  })
})

describe('the workspace tree (R2.8)', () => {
  it('shows repositories, worktrees under their suffix, root notes and docs/', async () => {
    const tree = await scanWorkspace(ws)
    expect(names(tree)).toEqual(['alpha', 'beta.ai'])
    const alpha = find(tree, 'alpha')
    expect(names(alpha.children)).toEqual(['develop', 'doc-spec', 'main'])
    const main = find(alpha.children, 'main')
    expect(main.path).toBe('alpha/alpha-main')
    expect(names(main.children)).toEqual(['CHANGELOG.md', 'README.md', 'docs'])
    const docs = find(main.children, 'docs')
    expect(names(docs.children)).toEqual(['guide.md', 'northstar.html', 'deep', 'img'])
    expect(find(docs.children, 'guide.md').path).toBe('alpha/alpha-main/docs/guide.md')
    expect(find(docs.children, 'northstar.html').type).toBe('attachment')
    expect(names(find(docs.children, 'img').children)).toEqual(['diagram.png'])
    expect(find(find(docs.children, 'deep').children, 'er').children[0].path).toBe('alpha/alpha-main/docs/deep/er/notes.md')
  })
  it('lists a worktree with nothing to show as an empty folder', async () => {
    const alpha = find(await scanWorkspace(ws), 'alpha')
    expect(find(alpha.children, 'doc-spec').children).toEqual([])
  })
  it('never lists code, node_modules, bare clones or loose top-level files', async () => {
    const flat = JSON.stringify(await scanWorkspace(ws))
    for (const hidden of ['index.js', 'package.json', 'src/notes.md', 'data.json', 'node_modules', '.git', 'loose-notes', 'archive.bundle']) {
      expect(flat).not.toContain(hidden)
    }
  })
})

describe('what the watcher passes on (R2.8)', () => {
  it('keeps the paths the tree shows and drops the rest', async () => {
    const repos = await repositoriesIn(ws)
    expect(inWorkspace('alpha/alpha-main/README.md', repos)).toBe(true)
    expect(inWorkspace('alpha/alpha-main/docs/deep/er/notes.md', repos)).toBe(true)
    expect(inWorkspace('alpha/alpha-main/docs/img/diagram.png', repos)).toBe(true)
    expect(inWorkspace('alpha/alpha-main/src/notes.md', repos)).toBe(false)
    expect(inWorkspace('alpha/alpha-main/docs/data.json', repos)).toBe(false)
    expect(inWorkspace('alpha/alpha.git/HEAD', repos)).toBe(false)
    expect(inWorkspace('node_modules/left-pad/README.md', repos)).toBe(false)
    expect(inWorkspace('loose-notes.md', repos)).toBe(false)
  })
})
