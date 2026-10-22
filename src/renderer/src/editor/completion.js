// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Completion in the source editor (R4.1): after [[ the vault's notes and
// files, ranked as the quick switcher ranks them and inserted in the shortest
// form that resolves; after [[Note# that note's headings, after [[Note#^ its
// block ids; after | nothing, since an alias is free text. A # outside a link
// completes the vault's tags.

import { syntaxTree } from '@codemirror/language'
import { fuzzyRank } from '../fuzzy.js'
import { resolveLink } from '../../../shared/links.js'
import { listHeadings } from '../../../shared/sections.js'

const LINK = /(!?)\[\[([^[\]|\n]*)$/
const TAG = /(?:^|[\s(])#([\p{L}\p{N}_/-]*)$/u
const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/
// Nodes in which neither a link nor a tag is written.
const NO_COMPLETION = ['FencedCode', 'CodeBlock', 'InlineCode', 'Comment', 'Frontmatter', 'HTMLBlock', 'URL']

// The shortest link target that resolves to path from the note at fromPath:
// the file name, then as many folders before it as it takes, ".md" left off.
export function shortestLink(path, fromPath, files) {
  const bare = /\.md$/i.test(path) ? path.slice(0, -3) : path
  const parts = bare.split('/')
  for (let k = parts.length - 1; k >= 0; k--) {
    const form = parts.slice(k).join('/')
    if (resolveLink(form, fromPath, files) === path) return form
  }
  return bare
}

// The block ids (^id at the end of a paragraph or list item) in a note.
export function listBlockIds(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const m = BLOCK_ID.exec(line)
    return m ? [m[1]] : []
  })
}

// Inserts text and closes the link, stepping over a ]] already there.
function closingLink(text) {
  return (view, _completion, from, to) => {
    const after = view.state.sliceDoc(to, to + 2) === ']]'
    const insert = after ? text : text + ']]'
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + text.length + 2 },
      userEvent: 'input.complete',
    })
  }
}

function inCodeOrComment(state, pos) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (NO_COMPLETION.includes(node.name)) return true
  }
  return false
}

// vault: { files() → every vault path, current() → the open note's path,
// readNote(path) → its text, tags() → [tag, count] pairs }.
export function vaultCompletions(vault) {
  return async (context) => {
    const { state, pos } = context
    const line = state.doc.lineAt(pos)
    const before = state.sliceDoc(line.from, pos)
    if (inCodeOrComment(state, pos)) return null

    const link = LINK.exec(before)
    if (link) {
      const body = link[2]
      const from = pos - body.length
      const files = vault.files()
      const current = vault.current()
      const hash = body.indexOf('#')
      if (hash < 0) {
        const paths = body.trim() ? fuzzyRank(body, files, 50) : files.filter((p) => /\.md$/i.test(p)).slice(0, 50)
        return {
          from,
          filter: false,
          options: paths.map((path) => {
            const label = shortestLink(path, current, files)
            const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
            return { label, detail: folder, type: /\.md$/i.test(path) ? 'text' : 'variable', apply: closingLink(label) }
          }),
        }
      }
      const target = body.slice(0, hash).trim()
      const path = target ? resolveLink(target, current, files) : current
      if (!path || !/\.md$/i.test(path)) return null
      let text
      try {
        text = await vault.readNote(path)
      } catch {
        return null
      }
      const sub = body.slice(hash + 1)
      if (sub.startsWith('^')) {
        return {
          from: from + hash + 2,
          options: listBlockIds(text).map((id) => ({ label: id, type: 'constant', apply: closingLink(id) })),
          validFor: /^[A-Za-z0-9-]*$/,
        }
      }
      return {
        from: from + hash + 1,
        options: listHeadings(text).map((h) => ({ label: h.text, detail: 'h' + h.level, type: 'keyword', apply: closingLink(h.text) })),
        validFor: /^[^[\]|#^\n]*$/,
      }
    }

    const tag = TAG.exec(before)
    // A bare # (perhaps a heading being typed) opens the list only on request.
    if (!tag || (!tag[1] && !context.explicit)) return null
    let pairs
    try {
      pairs = await vault.tags()
    } catch {
      return null
    }
    const most = Math.max(1, ...pairs.map(([, n]) => n))
    return {
      from: pos - tag[1].length,
      options: pairs.map(([name, n]) => ({ label: name, type: 'property', detail: String(n), boost: Math.round((n / most) * 20) })),
      validFor: /^[\p{L}\p{N}_/-]*$/u,
    }
  }
}
