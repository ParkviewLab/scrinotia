// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// When a note's text on disk conflicts with its unsaved edits (R1.5). An entry
// is the renderer's record of an open note: `disk` is the text last read from
// or written to disk, `dirty` whether the editor holds edits not yet saved.

// The disk text to offer in the conflict notice, or null when there is none:
// only edits not yet saved can conflict, and only with text that changed.
export function diskConflict(entry, disk) {
  if (!entry?.dirty || disk === null || disk === undefined) return null
  return disk === entry.disk ? null : disk
}
