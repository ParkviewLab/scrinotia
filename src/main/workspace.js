// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Workspaces (R2.8): a folder of repositories in the handbook's layout, each a
// folder <name> holding its bare clone <name>.git beside its worktrees
// <name>-<suffix>, opened read-only. Its tree shows the repositories, each
// worktree under its suffix (main, develop, live, doc-spec), and in each
// worktree only the notes in its root and its docs/ folder: notes, HTML pages
// and the files a document can embed, at any depth. Everything else (loose
// files at the top, node_modules, the bare clones, the worktrees' code) is
// neither listed, indexed nor watched.

import { readdir, stat } from 'node:fs/promises'
import { join, resolve, relative, sep, extname } from 'node:path'
import { isHidden } from './vault.js'

// What docs/ shows besides notes: HTML pages, and what a note can embed.
const DOCS_FILE = /\.(md|html?|png|jpe?g|gif|webp|svg|bmp|avif|pdf)$/i

const toRel = (root, full) => relative(resolve(root), full).split(sep).join('/')
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

async function isFile(full) {
  try {
    return (await stat(full)).isFile()
  } catch {
    return false
  }
}

async function isDir(full) {
  try {
    return (await stat(full)).isDirectory()
  } catch {
    return false
  }
}

async function dirEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

// The worktrees of the repository folder dir named name: its <name>-<suffix>
// folders holding a .git file (the marker git writes in every linked
// worktree), as [{ suffix, folder }], by suffix; [] when it has no bare clone
// <name>.git, so that it is not a repository at all.
export async function worktreesOf(dir, name) {
  if (!(await isDir(join(dir, `${name}.git`)))) return []
  const out = []
  for (const e of await dirEntries(dir)) {
    if (!e.isDirectory() || !e.name.startsWith(`${name}-`) || e.name.length <= name.length + 1) continue
    if (await isFile(join(dir, e.name, '.git'))) out.push({ suffix: e.name.slice(name.length + 1), folder: e.name })
  }
  return out.sort((a, b) => a.suffix.localeCompare(b.suffix, undefined, { numeric: true }))
}

// The repositories directly under root, as [{ name, worktrees }], by name.
export async function repositoriesIn(root) {
  const repos = []
  for (const e of await dirEntries(resolve(root))) {
    if (!e.isDirectory() || isHidden(e.name)) continue
    const worktrees = await worktreesOf(join(resolve(root), e.name), e.name)
    if (worktrees.length) repos.push({ name: e.name, worktrees })
  }
  return repos.sort(byName)
}

// A folder is a workspace when at least half of its visible subfolders are
// repositories (R2.8): one cloned repository inside an ordinary vault does
// not make it one.
export async function isWorkspace(root) {
  let folders = 0
  let repos = 0
  for (const e of await dirEntries(resolve(root))) {
    if (!e.isDirectory() || isHidden(e.name)) continue
    folders++
    if ((await worktreesOf(join(resolve(root), e.name), e.name)).length) repos++
  }
  return repos > 0 && repos * 2 >= folders
}

// A folder's entries as tree nodes; keep(name, isFolder) chooses files, and
// recurse decides whether a subfolder's own contents are shown.
async function walk(root, dir, keepFile, recurse) {
  const files = []
  const folders = []
  for (const e of await dirEntries(dir)) {
    if (isHidden(e.name)) continue
    const full = join(dir, e.name)
    if (e.isFile() && keepFile(e.name)) {
      const ext = extname(e.name).toLowerCase()
      files.push({ name: e.name, path: toRel(root, full), type: ext === '.md' ? 'note' : 'attachment' })
    } else if (e.isDirectory() && recurse) {
      const children = await walk(root, full, keepFile, recurse)
      if (children.length) folders.push({ name: e.name, path: toRel(root, full), type: 'folder', children })
    }
  }
  return [...files.sort(byName), ...folders.sort(byName)]
}

// The workspace's tree, in scanVault's shape ({ name, path, type, children }):
// a worktree's name is its suffix, its path the real one, so that links,
// resolveInside and the asset protocol need nothing special.
export async function scanWorkspace(root) {
  const base = resolve(root)
  const out = []
  for (const repo of await repositoriesIn(base)) {
    const children = []
    for (const wt of repo.worktrees) {
      const dir = join(base, repo.name, wt.folder)
      const notes = await walk(base, dir, (n) => /\.md$/i.test(n), false)
      const docsDir = join(dir, 'docs')
      const docs = (await isDir(docsDir)) ? await walk(base, docsDir, (n) => DOCS_FILE.test(n), true) : []
      const items = [...notes]
      if (docs.length) items.push({ name: 'docs', path: toRel(base, docsDir), type: 'folder', children: docs })
      children.push({ name: wt.suffix, path: toRel(base, dir), type: 'folder', children: items })
    }
    out.push({ name: repo.name, path: repo.name, type: 'folder', children })
  }
  return out
}

// Whether a vault-relative path is one the workspace shows (for the watcher):
// a note in a worktree's root, or a docs/ file of the kinds listed.
export function inWorkspace(rel, repos) {
  const parts = rel.split('/')
  if (parts.length < 3 || parts.some(isHidden)) return false
  const repo = repos.find((r) => r.name === parts[0])
  if (!repo || !repo.worktrees.some((w) => w.folder === parts[1])) return false
  if (parts.length === 3) return /\.md$/i.test(parts[2])
  return parts[2] === 'docs' && DOCS_FILE.test(parts[parts.length - 1])
}
