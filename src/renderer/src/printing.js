// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Printing the open note (R3.9).

// The title printed at the top: the note's file name without `.md`.
export function printTitle(path) {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

// Only a note is printed; a `.base` file or an attachment in the pane is not.
export function printable(kind) {
  return kind === 'note'
}
