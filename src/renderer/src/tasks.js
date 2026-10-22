// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Ticking a task box from the preview (R3.2, item 5): the box's list item
// carries its source line (item 13), and the line's `[ ]` or `[x]` is
// flipped as an edit of the reader's, so that it saves and undoes as typing
// does.

// A task item's marker: indentation, a bullet or number, then the box.
const TASK = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\]/

// The change that flips the box on this source line, as an offset within
// the line and the character to put there, or null when the line holds no
// task item (the note changed since the preview was drawn).
export function taskToggle(lineText) {
  const m = TASK.exec(lineText)
  if (!m) return null
  return { offset: m[1].length, insert: m[2] === ' ' ? 'x' : ' ' }
}
