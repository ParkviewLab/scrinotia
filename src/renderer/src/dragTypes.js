// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The data types a drag from the file tree or the search results carries.
// Every dragged row carries its vault path, so that the tree can move it; a
// folder carries a second type as well, so that a note refuses it (R2.7):
// a link to a folder resolves to nothing.

export const PATH_TYPE = 'text/x-scrinotia-path'
export const FOLDER_TYPE = 'text/x-scrinotia-folder'

// The types to set on a drag of this vault path.
export function dragData(path, isFolder) {
  return isFolder ? { [PATH_TYPE]: path, [FOLDER_TYPE]: path } : { [PATH_TYPE]: path }
}

// What a drop on the file tree does with a drag of these types (R2.9, R2.3):
// 'move' for a row dragged within the tree, 'copy' for files from outside
// the vault, and null for anything else.
export function treeDrop(types) {
  const t = Array.from(types ?? [])
  if (t.includes(PATH_TYPE)) return 'move'
  if (t.includes('Files')) return 'copy'
  return null
}

// Whether a drag with these types may be dropped on a note: files from
// outside the vault, or a file from inside it, but not a folder.
export function noteAccepts(types) {
  const t = Array.from(types ?? [])
  if (t.includes(FOLDER_TYPE)) return false
  return t.includes('Files') || t.includes(PATH_TYPE)
}
