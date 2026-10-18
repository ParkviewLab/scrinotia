// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The rendered preview of a note (R3.1): Markdown to sanitised HTML with the
// vault's dialect (wikilinks, embeds, highlights, comments, callouts) and the
// frontmatter shown as a properties table. Rendering never touches the note.

import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import { splitLink } from '../../shared/markdown.js'

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

export function splitFrontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(text)
  if (!m) return { yaml: null, body: text }
  return { yaml: m[1], body: text.slice(m[0].length) }
}

function propertiesTable(yaml) {
  return `<details class="properties" open><summary>Properties</summary><pre>${escapeHtml(yaml)}</pre></details>`
}

// assetUrl(target) -> URL of an embedded file, or null when it does not resolve.
// resolvePath(target) -> the vault path a link resolves to, or null.
export function createPreview({ assetUrl, resolves, resolvePath = () => null }) {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    extensions: [
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
        if (!/^(https?:|gv-asset:)/i.test(src)) return `<span class="missing">${escapeHtml(text || href)}</span>`
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

  return {
    render(text, into) {
      const { yaml, body } = splitFrontmatter(text)
      const html = (yaml !== null ? propertiesTable(yaml) : '') + marked.parse(body)
      const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['data-wikilink', 'data-href', 'data-base', 'data-view'], ALLOWED_URI_REGEXP: /^(?:https?|mailto|gv-asset):|^#/i })
      into.innerHTML = clean
      calloutPass(into)
      for (const box of into.querySelectorAll('input[type="checkbox"]')) box.disabled = true
    },
  }
}
