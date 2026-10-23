// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The note's modes and the split view's divider (R3.1, item 15).

// The three modes, in the order Cmd/Ctrl+E cycles them.
export const NOTE_MODES = ['preview', 'split', 'source']

export function nextMode(mode) {
  return NOTE_MODES[(NOTE_MODES.indexOf(mode) + 1) % NOTE_MODES.length]
}

// The divider sets the editor's share of the note area. Each side keeps at
// least `min` pixels, or half the area when it is narrower than both.
export const DEFAULT_SHARE = 0.5
export function clampShare(share, width, min = 240) {
  if (!(width > 0) || !Number.isFinite(share)) return DEFAULT_SHARE
  const lo = Math.min(0.5, min / width)
  return Math.max(lo, Math.min(1 - lo, share))
}
