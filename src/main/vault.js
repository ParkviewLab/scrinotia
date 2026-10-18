// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Filesystem access to one vault. Every path that crosses the IPC boundary is
// vault-relative and is resolved through resolveInside, so the renderer can
// never name a file outside the vault. Nothing here writes on open (R1.1), and
// dot-entries (.obsidian/, .scrinotia/, .git/) are neither listed nor
// touched (R1.2).

import { readdir, readFile, writeFile, rename, mkdir, stat, open, copyFile, constants } from 'node:fs/promises'
import { join, resolve, relative, sep, dirname, basename, extname } from 'node:path'

export function isHidden(name) {
  return name.startsWith('.')
}

export function resolveInside(root, rel) {
  const base = resolve(root)
  const full = resolve(base, rel ?? '')
  const back = relative(base, full)
  if (back === '..' || back.startsWith('..' + sep) || resolve(back) === back) {
    throw new Error(`path outside the vault: ${rel}`)
  }
  for (const part of back.split(sep)) {
    if (part && isHidden(part)) throw new Error(`hidden path: ${rel}`)
  }
  return full
}

function toRel(root, full) {
  return relative(resolve(root), full).split(sep).join('/')
}

function compareEntries(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
}

// The tree as nested { name, path, type, children? }; type is folder, note
// (a .md file), or attachment (anything else).
export async function scanVault(root) {
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const out = []
    for (const e of entries) {
      if (isHidden(e.name)) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        out.push({ name: e.name, path: toRel(root, full), type: 'folder', children: await walk(full) })
      } else if (e.isFile()) {
        const ext = extname(e.name).toLowerCase()
        const type = ext === '.md' ? 'note' : ext === '.base' ? 'base' : 'attachment'
        out.push({ name: e.name, path: toRel(root, full), type })
      }
    }
    return out.sort(compareEntries)
  }
  return walk(resolve(root))
}

export async function readNote(root, rel) {
  return readFile(resolveInside(root, rel), 'utf8')
}

// The raw bytes of a vault file, for viewers that parse a binary format.
export async function readBytes(root, rel) {
  return readFile(resolveInside(root, rel))
}

// Atomic replace: write a sibling temporary file, flush it, rename it over.
export async function writeNote(root, rel, text) {
  const full = resolveInside(root, rel)
  const tmp = join(dirname(full), `.${basename(full)}.scrinotia-tmp`)
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(text, 'utf8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  await rename(tmp, full)
}

async function exists(full) {
  try {
    await stat(full)
    return true
  } catch {
    return false
  }
}

// A free name in folderRel: base.ext, then "base 1.ext", "base 2.ext", ...
async function freeName(root, folderRel, base, ext) {
  for (let n = 0; ; n++) {
    const name = n === 0 ? `${base}${ext}` : `${base} ${n}${ext}`
    const rel = folderRel ? `${folderRel}/${name}` : name
    if (!(await exists(resolveInside(root, rel)))) return rel
  }
}

export async function createNote(root, folderRel, base = 'Untitled') {
  if (folderRel) await mkdir(resolveInside(root, folderRel), { recursive: true })
  const rel = await freeName(root, folderRel, base, '.md')
  await writeFile(resolveInside(root, rel), '', { flag: 'wx' })
  return rel
}

export async function createFolder(root, folderRel, base = 'New folder') {
  const rel = await freeName(root, folderRel, base, '')
  await mkdir(resolveInside(root, rel))
  return rel
}

// Rename or move; refuses to overwrite an existing entry.
export async function move(root, fromRel, toRel) {
  const from = resolveInside(root, fromRel)
  const to = resolveInside(root, toRel)
  if (await exists(to)) throw new Error(`already exists: ${toRel}`)
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
  return toRel
}

// Deletion goes to the system trash (R2.3); the trash function is injected so
// that this module does not depend on Electron.
export async function trash(root, rel, trashItem) {
  await trashItem(resolveInside(root, rel))
}

// Size and times of a file. The creation time is the birth time where the
// filesystem records one; where it reports none (0), the earlier of the
// change and modification times stands in for it.
export async function statFile(root, rel) {
  const st = await stat(resolveInside(root, rel))
  const born = st.birthtimeMs > 0 ? st.birthtimeMs : Math.min(st.ctimeMs, st.mtimeMs)
  return { size: st.size, ctime: Math.round(born), mtime: Math.round(st.mtimeMs) }
}

// Copies a file from outside the vault into folderRel (created if missing),
// under its own name or, if that is taken, a numbered one (R2.7). Returns the
// new vault-relative path. The source is left as it is.
export async function importFile(root, sourcePath, folderRel) {
  const src = resolve(sourcePath)
  const info = await stat(src)
  if (!info.isFile()) throw new Error(`not a file: ${sourcePath}`)
  if (folderRel) await mkdir(resolveInside(root, folderRel), { recursive: true })
  const name = basename(src)
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const rel = await freeName(root, folderRel, base, ext)
  await copyFile(src, resolveInside(root, rel), constants.COPYFILE_EXCL)
  return rel
}
