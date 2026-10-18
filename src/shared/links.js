// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Link resolution (R4.2), fixed in this project: matching is case-insensitive;
// a target without "/" matches by file name, one with "/" by the end of the
// path; ".md" may be omitted for notes; among several matches the one in the
// linking note's own folder wins, then the shortest path, then the first in
// alphabetical order.

const lower = (s) => s.toLowerCase()

function folderOf(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

// files: vault-relative paths of every file. Returns the resolved path or null.
export function resolveLink(target, fromPath, files) {
  let t = target.trim().replace(/^\/+/, '')
  if (!t) return null
  const wanted = [lower(t)]
  if (!/\.[a-z0-9]+$/i.test(t) || !/\.md$/i.test(t)) wanted.push(lower(t) + '.md')
  const hasSlash = t.includes('/')
  const matches = files.filter((f) => {
    const lf = lower(f)
    return wanted.some((w) => (hasSlash ? lf === w || lf.endsWith('/' + w) : lf.slice(lf.lastIndexOf('/') + 1) === w))
  })
  if (matches.length === 0) return null
  const home = folderOf(fromPath ?? '')
  return matches.sort((a, b) => {
    const ah = folderOf(a) === home ? 0 : 1
    const bh = folderOf(b) === home ? 0 : 1
    return ah - bh || a.length - b.length || a.localeCompare(b)
  })[0]
}

// A relative Markdown link (decoded) resolved against the linking note's folder.
export function resolveRelative(target, fromPath, files) {
  const parts = folderOf(fromPath ?? '').split('/').filter(Boolean)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  const path = parts.join('/')
  return files.find((f) => lower(f) === lower(path)) ?? resolveLink(target, fromPath, files)
}

export function flattenFiles(tree) {
  return tree.flatMap((e) => (e.children ? flattenFiles(e.children) : [e.path]))
}
