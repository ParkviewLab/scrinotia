// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The link at a position of the source, read from the syntax tree, for
// following a link from the editor (Cmd/Ctrl+click and the context menu): a
// wikilink or embed gives its body, as the preview's data-wikilink does; a
// Markdown link, an autolink or a bare URL gives its URL, as data-href does.

import { syntaxTree } from '@codemirror/language'

// Returns { kind: 'wikilink' | 'href', ref, from, to } or null.
export function linkAt(state, pos) {
  for (const side of [1, -1]) {
    for (let node = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name === 'Wikilink' || node.name === 'Embed') {
        const open = node.name === 'Embed' ? 3 : 2
        return { kind: 'wikilink', ref: state.sliceDoc(node.from + open, node.to - 2), from: node.from, to: node.to }
      }
      if (node.name === 'Link' || node.name === 'Image' || node.name === 'Autolink') {
        const url = node.getChild('URL')
        if (!url) return null
        return { kind: 'href', ref: state.sliceDoc(url.from, url.to), from: node.from, to: node.to }
      }
      if (node.name === 'URL') return { kind: 'href', ref: state.sliceDoc(node.from, node.to), from: node.from, to: node.to }
    }
  }
  return null
}
