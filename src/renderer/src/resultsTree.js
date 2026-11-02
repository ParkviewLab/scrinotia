// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The search results as a tree (R5.1): the file tree pruned to the folders
// that hold a result, in its own order. A result the tree does not list is
// returned apart, to follow the tree.

const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')

// tree: the file tree's entries ({ path, name, type, children? });
// results: [{ path, ... }]. Returns { nodes, unplaced }, a node being
// { entry } for a result or { entry, children } for a folder.
export function resultsTree(tree, results) {
  const byPath = new Map(results.map((r) => [r.path, r]))
  const needed = new Set()
  for (const r of results) for (let p = r.path; p; p = parentOf(p)) needed.add(p)
  const placed = new Set()
  const build = (entry) => {
    if (!needed.has(entry.path)) return null
    if (entry.type !== 'folder') {
      if (!byPath.has(entry.path)) return null
      placed.add(entry.path)
      return { entry, result: byPath.get(entry.path) }
    }
    const children = entry.children.map(build).filter(Boolean)
    return children.length ? { entry, children } : null
  }
  const nodes = tree.map(build).filter(Boolean)
  return { nodes, unplaced: results.filter((r) => !placed.has(r.path)) }
}
