// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault's Markdown dialect as @lezer/markdown extensions: frontmatter (a
// ---/--- block at the start of a note), wikilinks and embeds
// ([[target#sub|alias]], ![[...]]), highlights (==text==), and inline comments
// (%%text%%). The editor and the link index use this one parser, so a [[link]]
// inside code is a link to neither.

import { parser as baseParser, GFM } from '@lezer/markdown'
import { Tag, tags as t } from '@lezer/highlight'

const OPEN = 91 // [
const CLOSE = 93 // ]
const BANG = 33 // !
const EQUALS = 61 // =
const PERCENT = 37 // %
const NEWLINE = 10

const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' }

// Highlight tags for the dialect's own nodes that the standard set lacks; the
// editor's style gives them colours from theme.css.
export const vaultTags = {
  alias: Tag.define(), // a wikilink's |alias
  highlight: Tag.define(), // ==text==
}

// Frontmatter, matched as the link index (frontmatterOf), the sections module
// (stripFrontmatter) and the preview match it: a first line of exactly ---, an
// optional BOM before it, and a closing --- or ... line; unclosed, the first
// line stays a horizontal rule. Groups: the opening line, the content and the
// closing line.
const FRONTMATTER = /^(\uFEFF?---)\r?\n([\s\S]*?)\r?\n((?:---|\.\.\.)[^\S\r\n]*)\r?(?:\n|$)/

const Frontmatter = {
  name: 'Frontmatter',
  parse(cx, line) {
    if (cx.lineStart !== 0 || !/^\uFEFF?---$/.test(line.text.replace(/\r$/, ''))) return false
    // Whether the block is closed needs the text beyond the current line,
    // which BlockContext offers only through its untyped input field (present
    // in @lezer/markdown 1.8); the parser tests pin it.
    const m = FRONTMATTER.exec(cx.input.read(0, cx.input.length))
    if (!m) return false
    const open = m[1].length
    const contentFrom = m[0].indexOf('\n') + 1
    const contentTo = contentFrom + m[2].length
    const close = m.index + m[0].lastIndexOf(m[3])
    const end = close + m[3].length
    // The content is inline-parsed as before this node existed, so wikilinks
    // in properties stay in the link index; the editor shows it as YAML.
    const children = [cx.elt('FrontmatterMark', 0, open)]
    if (contentTo > contentFrom)
      children.push(cx.elt('FrontmatterContent', contentFrom, contentTo, cx.parser.parseInline(m[2], contentFrom)))
    children.push(cx.elt('FrontmatterMark', close, close + 3))
    while (cx.lineStart < close && cx.nextLine()) {
      // consume the block's lines up to the closing one
    }
    cx.nextLine()
    cx.addElement(cx.elt('Frontmatter', 0, end, children))
    return true
  },
  before: 'HorizontalRule',
}

export const VaultMarkdown = {
  defineNodes: [
    { name: 'Frontmatter', block: true },
    { name: 'FrontmatterMark', style: t.processingInstruction },
    'FrontmatterContent',
    { name: 'Wikilink', style: { 'Wikilink/...': t.link } },
    { name: 'Embed', style: { 'Embed/...': t.link } },
    { name: 'WikilinkMark', style: t.processingInstruction },
    'WikilinkTarget',
    { name: 'WikilinkAlias', style: vaultTags.alias },
    { name: 'Highlight', style: { 'Highlight/...': vaultTags.highlight } },
    { name: 'HighlightMark', style: t.processingInstruction },
    { name: 'Comment', style: { 'Comment/...': t.comment } },
    { name: 'CommentMark', style: t.comment },
  ],
  parseBlock: [Frontmatter],
  parseInline: [
    {
      name: 'Wikilink',
      parse(cx, next, pos) {
        let start = pos
        let embed = false
        if (next === BANG && cx.char(pos + 1) === OPEN && cx.char(pos + 2) === OPEN) {
          embed = true
          pos += 1
        } else if (!(next === OPEN && cx.char(pos + 1) === OPEN)) {
          return -1
        }
        const inner = pos + 2
        let close = -1
        for (let i = inner; i < cx.end - 1; i++) {
          const c = cx.char(i)
          if (c === NEWLINE || (c === OPEN && cx.char(i + 1) === OPEN)) return -1
          if (c === CLOSE && cx.char(i + 1) === CLOSE) {
            close = i
            break
          }
        }
        if (close <= inner) return -1
        const children = []
        if (embed) children.push(cx.elt('WikilinkMark', start, start + 1))
        children.push(cx.elt('WikilinkMark', pos, inner))
        const body = cx.slice(inner, close)
        const bar = body.indexOf('|')
        if (bar < 0) {
          children.push(cx.elt('WikilinkTarget', inner, close))
        } else {
          children.push(cx.elt('WikilinkTarget', inner, inner + bar))
          children.push(cx.elt('WikilinkMark', inner + bar, inner + bar + 1))
          children.push(cx.elt('WikilinkAlias', inner + bar + 1, close))
        }
        children.push(cx.elt('WikilinkMark', close, close + 2))
        return cx.addElement(cx.elt(embed ? 'Embed' : 'Wikilink', start, close + 2, children))
      },
      before: 'Link',
    },
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) return -1
        const before = cx.slice(pos - 1, pos)
        const after = cx.slice(pos + 2, pos + 3)
        const spaceBefore = /\s|^$/.test(before)
        const spaceAfter = /\s|^$/.test(after)
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, !spaceAfter, !spaceBefore)
      },
      after: 'Emphasis',
    },
    {
      name: 'Comment',
      parse(cx, next, pos) {
        if (next !== PERCENT || cx.char(pos + 1) !== PERCENT) return -1
        for (let i = pos + 2; i < cx.end - 1; i++) {
          if (cx.char(i) === NEWLINE) return -1
          if (cx.char(i) === PERCENT && cx.char(i + 1) === PERCENT) {
            return cx.addElement(
              cx.elt('Comment', pos, i + 2, [cx.elt('CommentMark', pos, pos + 2), cx.elt('CommentMark', i, i + 2)]),
            )
          }
        }
        return -1
      },
      before: 'Emphasis',
    },
  ],
}

export const vaultParser = baseParser.configure([GFM, VaultMarkdown])

// Split a wikilink body "target#sub|alias" into its parts.
export function splitLink(body) {
  const bar = body.indexOf('|')
  const ref = bar < 0 ? body : body.slice(0, bar)
  const alias = bar < 0 ? null : body.slice(bar + 1)
  const hash = ref.indexOf('#')
  const target = (hash < 0 ? ref : ref.slice(0, hash)).trim()
  const subpath = hash < 0 ? null : ref.slice(hash + 1).trim()
  return { target, subpath, alias }
}

// Every link in a note, from the same tree the editor uses: wikilinks, embeds,
// and Markdown links to local .md files. Positions are offsets in text.
export function parseLinks(text) {
  const links = []
  const tree = vaultParser.parse(text)
  tree.iterate({
    enter(node) {
      if (node.name === 'Wikilink' || node.name === 'Embed') {
        const embed = node.name === 'Embed'
        const bodyFrom = node.from + (embed ? 3 : 2)
        const bodyTo = node.to - 2
        const t = node.node.getChild('WikilinkTarget')
        links.push({
          kind: 'wikilink',
          embed,
          ...splitLink(text.slice(bodyFrom, bodyTo)),
          from: node.from,
          to: node.to,
          targetFrom: t ? t.from : bodyFrom,
          targetTo: t ? t.to : bodyFrom,
        })
        return false
      }
      if (node.name === 'Link') {
        const url = node.node.getChild('URL')
        if (!url) return false
        const raw = text.slice(url.from, url.to)
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return false
        let decoded = raw
        try {
          decoded = decodeURIComponent(raw)
        } catch {
          // keep the raw form
        }
        const hash = decoded.indexOf('#')
        const path = hash < 0 ? decoded : decoded.slice(0, hash)
        if (!/\.md$/i.test(path)) return false
        links.push({
          kind: 'markdown',
          embed: false,
          target: path,
          subpath: hash < 0 ? null : decoded.slice(hash + 1),
          alias: null,
          from: node.from,
          to: node.to,
          targetFrom: url.from,
          targetTo: url.to,
        })
        return false
      }
      return undefined
    },
  })
  return links
}

// Tags in the body (#tag, #a/b), outside code, comments and links.
export function parseTags(text) {
  const tags = []
  const skip = []
  vaultParser.parse(text).iterate({
    enter(node) {
      if (
        ['FencedCode', 'CodeBlock', 'InlineCode', 'Comment', 'Wikilink', 'Embed', 'Link', 'URL', 'HTMLBlock'].includes(
          node.name,
        )
      ) {
        skip.push([node.from, node.to])
        return false
      }
      return undefined
    },
  })
  const re = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu
  for (const m of text.matchAll(re)) {
    const at = m.index + m[1].length
    if (skip.some(([a, b]) => at >= a && at < b)) continue
    tags.push(m[2])
  }
  return tags
}

// The line separator a note uses: CRLF if its first break is CRLF, else LF.
export function detectLineSeparator(text) {
  const i = text.indexOf('\n')
  return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n'
}
