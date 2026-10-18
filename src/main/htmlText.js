// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The displayed text of an HTML attachment, for search (R5.5): the page's
// title and the text of its body, without scripts, styles or markup, one
// line per block element. Text a page's scripts would add when it runs is
// not seen, since the page is not run.

import { Parser } from 'htmlparser2'

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'head'])
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'table', 'tr', 'td', 'th', 'figcaption', 'br', 'hr', 'title'])

export function htmlText(html) {
  let skip = 0
  let pre = 0
  let inTitle = false
  let title = ''
  const out = []
  const parser = new Parser(
    {
      onopentag(name) {
        if (name === 'title') inTitle = true
        else if (SKIP.has(name)) skip++
        if (name === 'pre') pre++
        if (BLOCK.has(name)) out.push('\n')
      },
      ontext(text) {
        if (inTitle) title += text
        // Line breaks in the source are spaces, as the browser shows them, except in <pre>.
        else if (!skip) out.push(pre ? text : text.replace(/\s+/g, ' '))
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false
        else if (SKIP.has(name)) skip = Math.max(0, skip - 1)
        if (name === 'pre') pre = Math.max(0, pre - 1)
        if (BLOCK.has(name)) out.push('\n')
      },
    },
    { decodeEntities: true },
  )
  parser.write(html)
  parser.end()
  const body = out
    .join('')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  const t = title.replace(/\s+/g, ' ').trim()
  return t ? `${t}\n${body}` : body
}
