// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fenced code in both panes: the editor parses a fence's content with the
// grammar its info string names, and the preview colours its code blocks with
// the same grammars, through the same colour tokens. The grammars come from
// @codemirror/language-data, each loaded only when a fence first names it;
// nothing is fetched from the network (R6.3), since they are bundled.

import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { classHighlighter, highlightTree } from '@lezer/highlight'

export const codeLanguages = languages

// The language a fence's info string names (its first word), or null.
export function languageFor(info) {
  const name = (info ?? '').trim().split(/\s/)[0]
  return name ? LanguageDescription.matchLanguageName(languages, name, true) : null
}

// Colours every <pre><code class="language-…"> under root whose language is
// known, once its grammar has loaded; a block that has changed or left the
// page meanwhile is left alone. Resolves when all are done.
export async function highlightCodeBlocks(root) {
  const blocks = [...root.querySelectorAll('pre > code[class*="language-"]')]
  await Promise.all(
    blocks.map(async (code) => {
      const name = /(?:^|\s)language-(\S+)/.exec(code.className)?.[1]
      const description = languageFor(name)
      if (!description) return
      const text = code.textContent
      let support
      try {
        support = description.support ?? (await description.load())
      } catch {
        return
      }
      // The preview may have been redrawn whilst the grammar loaded.
      if (!root.contains(code) || code.textContent !== text) return
      const out = document.createDocumentFragment()
      let at = 0
      highlightTree(support.language.parser.parse(text), classHighlighter, (from, to, cls) => {
        if (from > at) out.append(text.slice(at, from))
        const span = document.createElement('span')
        span.className = cls
        span.textContent = text.slice(from, to)
        out.append(span)
        at = to
      })
      if (at < text.length) out.append(text.slice(at))
      code.replaceChildren(out)
      code.classList.add('highlighted')
    }),
  )
}
