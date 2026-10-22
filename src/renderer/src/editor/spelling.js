// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// What the spelling checker leaves alone in a note: link targets, URLs, code
// and the frontmatter, which are names and syntax rather than prose. Each is
// marked spellcheck="false", which the browser's checker honours inside the
// editable content.

import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

const NOT_PROSE = new Set(['WikilinkTarget', 'URL', 'Autolink', 'InlineCode', 'FencedCode', 'CodeBlock', 'Frontmatter', 'HTMLBlock', 'HTMLTag'])
const unchecked = Decoration.mark({ attributes: { spellcheck: 'false' } })

export function uncheckedRanges(state, from = 0, to = state.doc.length) {
  const ranges = []
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!NOT_PROSE.has(node.name)) return undefined
      if (node.to > node.from) ranges.push([node.from, node.to])
      return false
    },
  })
  return ranges
}

function build(view) {
  const builder = new RangeSetBuilder()
  let last = -1
  for (const { from, to } of view.visibleRanges) {
    // A node across two visible ranges (around a fold) is added once.
    for (const [a, b] of uncheckedRanges(view.state, from, to)) {
      if (a <= last) continue
      builder.add(a, b, unchecked)
      last = a
    }
  }
  return builder.finish()
}

export const notProse = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = build(view)
    }
    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations },
)
