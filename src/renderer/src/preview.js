// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The rendered preview of a note (R3.1): Markdown to sanitised HTML with the
// vault's dialect (wikilinks, embeds, highlights, comments, callouts) and the
// frontmatter shown as a properties table. Rendering never touches the note.

import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import katex from 'katex'
import { splitLink } from '../../shared/markdown.js'
import { tokenLines, listItemLines } from './sourceLines.js'

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

// Item 13: the HTML of a note's preview carries an empty marker element
// before each top-level block, naming the block's first source line; after
// sanitising, each marker's line moves onto the element that follows it and
// the marker is removed. Blocks are marked in one parse and one sanitising
// pass, so raw HTML that spans blocks (a <details> around paragraphs) is
// rendered as before.
const MARK = 'data-src-mark'
export const LINE = 'data-src-line'

export function splitFrontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(text)
  if (!m) return { yaml: null, body: text }
  return { yaml: m[1], body: text.slice(m[0].length) }
}

function propertiesTable(yaml) {
  // Closed by default; main.js reopens it on a redraw of a note whose
  // Properties the reader opened.
  return `<details class="properties"><summary>Properties</summary><pre>${escapeHtml(yaml)}</pre></details>`
}

// assetUrl(target) -> URL of an embedded file, or null when it does not resolve.
// resolvePath(target) -> the vault path a link resolves to, or null.
export function createPreview({ assetUrl, resolves, resolvePath = () => null, attachmentKind = () => 'other' }) {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    extensions: [
      // Math (R3.8): $$…$$ as a display block, $…$ inline, rendered by KaTeX.
      // An inline $ must not be followed by a space, nor the closing $ be
      // preceded by one or followed by a digit, so prices such as $5 stay text.
      {
        name: 'mathBlock',
        level: 'block',
        start: (src) => src.match(/^\$\$/m)?.index,
        tokenizer(src) {
          const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src)
          if (!m) return undefined
          return { type: 'mathBlock', raw: m[0], tex: m[1].trim() }
        },
        renderer: (token) => `<div class="math-block">${katex.renderToString(token.tex, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' })}</div>`,
      },
      {
        name: 'mathInline',
        level: 'inline',
        start: (src) => src.indexOf('$'),
        tokenizer(src) {
          const m = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(src)
          if (!m) return undefined
          return { type: 'mathInline', raw: m[0], tex: m[1] }
        },
        renderer: (token) => katex.renderToString(token.tex, { displayMode: false, throwOnError: false, output: 'htmlAndMathml' }),
      },
      {
        name: 'wikilink',
        level: 'inline',
        start: (src) => src.match(/!?\[\[/)?.index,
        tokenizer(src) {
          const m = /^(!?)\[\[([^\]\n]+?)\]\]/.exec(src)
          if (!m) return undefined
          return { type: 'wikilink', raw: m[0], embed: m[1] === '!', body: m[2] }
        },
        renderer(token) {
          const { target, subpath, alias } = splitLink(token.body)
          const label = escapeHtml(alias ?? (target || `#${subpath ?? ''}`) + (alias || !subpath || !target ? '' : ` › ${subpath}`))
          const ref = escapeHtml(token.body.split('|')[0])
          // An embedded base becomes a placeholder that the app fills with
          // the base's views (or the one view named after #).
          if (token.embed && /\.base$/i.test(target)) {
            const path = resolvePath(target)
            if (path) return `<span class="base-embed" data-base="${escapeHtml(path)}" data-view="${escapeHtml(subpath ?? '')}"></span>`
          }
          // An embedded note (![[Note]], ![[Note#Heading]], ![[Note#^block]])
          // becomes a placeholder that the app fills with the note's content.
          if (token.embed && target && !/\.[a-z0-9]+$/i.test(target.replace(/\.md$/i, '')) ) {
            const path = resolvePath(target)
            if (path && /\.md$/i.test(path)) {
              return `<span class="note-embed" data-path="${escapeHtml(path)}" data-sub="${escapeHtml(subpath ?? '')}"></span>`
            }
          }
          // Other embedded attachments (PDF, audio, video, HTML, text) become
          // placeholders that the app fills with a viewer.
          if (token.embed && !IMAGE.test(target) && !/\.(md|base)$/i.test(target)) {
            const path = resolvePath(target)
            if (path && attachmentKind(path) !== 'other' && attachmentKind(path) !== 'image') {
              return `<span class="attachment-embed" data-path="${escapeHtml(path)}"></span>`
            }
          }
          if (token.embed && IMAGE.test(target)) {
            const url = assetUrl(target)
            if (url) return `<img class="embed-image" src="${escapeHtml(url)}" alt="${escapeHtml(alias ?? target)}">`
          }
          const cls = `${token.embed ? 'embed-link' : 'wikilink'}${resolves(target) || !target ? '' : ' unresolved'}`
          return `<a class="${cls}" data-wikilink="${ref}">${label}</a>`
        },
      },
      {
        name: 'highlight',
        level: 'inline',
        start: (src) => src.indexOf('=='),
        tokenizer(src) {
          const m = /^==(?=\S)([^\n]*?\S)==/.exec(src)
          if (!m) return undefined
          return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) }
        },
        renderer(token) {
          return `<mark>${this.parser.parseInline(token.tokens)}</mark>`
        },
      },
      {
        name: 'comment',
        level: 'inline',
        start: (src) => src.indexOf('%%'),
        tokenizer(src) {
          const m = /^%%[\s\S]*?%%/.exec(src)
          if (!m) return undefined
          return { type: 'comment', raw: m[0] }
        },
        renderer: () => '',
      },
    ],
    renderer: {
      // A mermaid code block is left as its source in a marked element; the
      // app replaces it with the drawn diagram (R3.8).
      code({ text, lang }) {
        if ((lang ?? '').trim().toLowerCase() === 'mermaid') return `<pre class="mermaid-src">${escapeHtml(text)}</pre>`
        return false
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens)
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        return `<a data-href="${escapeHtml(href)}"${t}>${text}</a>`
      },
      image({ href, title, text }) {
        let src = href
        if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
          let decoded = href
          try {
            decoded = decodeURIComponent(href)
          } catch {
            // keep the raw form
          }
          src = assetUrl(decoded) ?? ''
        }
        if (!/^(https?:|scrinotia-asset:)/i.test(src)) return `<span class="missing">${escapeHtml(text || href)}</span>`
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${t}>`
      },
    },
  })

  function calloutPass(root) {
    for (const q of root.querySelectorAll('blockquote')) {
      const first = q.firstElementChild
      if (!first || first.tagName !== 'P') continue
      const m = /^\[!([\w-]+)\]([+-]?)[ \t]*([\s\S]*)/.exec(first.innerHTML)
      if (!m) continue
      const type = m[1].toLowerCase()
      const brk = /<br>|\n/.exec(m[3])
      const title = brk ? m[3].slice(0, brk.index) : m[3]
      const rest = brk ? m[3].slice(brk.index + brk[0].length) : ''
      const box = document.createElement('div')
      box.className = `callout callout-${type}`
      const head = document.createElement('div')
      head.className = 'callout-title'
      head.innerHTML = title || type.charAt(0).toUpperCase() + type.slice(1)
      box.append(head)
      if (rest.trim()) {
        const p = document.createElement('p')
        p.innerHTML = rest
        box.append(p)
      }
      first.remove()
      box.append(...q.childNodes)
      q.replaceWith(box)
    }
  }

  // The note's HTML before sanitising; with `lines`, the block markers and
  // the lexer's tokens with their first lines, for stamping.
  function toHtml(text, { lines = false } = {}) {
    const { yaml, body: raw } = splitFrontmatter(text)
    // Block markers (a trailing ^id that an embed can point to) are not shown.
    const body = raw.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, '')
    const head = yaml !== null ? propertiesTable(yaml) : ''
    if (!lines) return { html: head + marked.parse(body) }
    const tokens = marked.lexer(body)
    const first = 1 + breaksIn(text.slice(0, text.length - raw.length))
    const starts = tokenLines(tokens, first)
    const withMarks = tokens.flatMap((t, i) => [{ type: 'html', block: true, raw: '', pre: false, text: `<span ${MARK}="${i}"></span>` }, t])
    withMarks.links = tokens.links
    return { html: head + marked.parser(withMarks), tokens, starts }
  }

  // Moves each marker's line onto the block element after it; a list's items
  // (and the lists nested in them) get their own lines.
  function stamp(into, tokens, starts) {
    for (const mark of into.querySelectorAll(`[${MARK}]`)) {
      const i = Number(mark.getAttribute(MARK))
      let el = mark.nextSibling
      while (el && el.nodeType === 3 && !el.textContent.trim()) el = el.nextSibling
      mark.remove()
      if (!el || el.nodeType !== 1 || el.hasAttribute(MARK) || !tokens[i]) continue
      el.setAttribute(LINE, String(starts[i]))
      if (tokens[i].type === 'list' && /^(UL|OL)$/.test(el.tagName)) stampList(el, listItemLines(tokens[i], starts[i]))
    }
  }

  function stampList(el, items) {
    const lis = [...el.children].filter((c) => c.tagName === 'LI')
    items.forEach((item, k) => {
      const li = lis[k]
      if (!li) return
      li.setAttribute(LINE, String(item.line))
      const nested = [...li.children].filter((c) => /^(UL|OL)$/.test(c.tagName))
      item.lists.forEach((sub, j) => nested[j] && stampList(nested[j], sub))
    })
  }

  return {
    toHtml,
    // Draws the note into an element. With `lines` (the open note's own
    // preview, not an embedded note), its blocks carry their source lines.
    render(text, into, { lines = false } = {}) {
      const { html, tokens, starts } = toHtml(text, { lines })
      const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['data-wikilink', 'data-href', 'data-base', 'data-view', 'data-path', 'data-sub', MARK], ALLOWED_URI_REGEXP: /^(?:https?|mailto|scrinotia-asset):|^#/i })
      into.innerHTML = clean
      calloutPass(into)
      if (lines) stamp(into, tokens, starts)
      for (const box of into.querySelectorAll('input[type="checkbox"]')) box.disabled = true
    },
  }
}

const breaksIn = (s) => (s.match(/\n/g) ?? []).length
