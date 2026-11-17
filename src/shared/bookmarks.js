// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Bookmarks of a selected passage in a note (R2.10), as pure functions over a
// note's source text. A bookmark keeps several locators, strongest first: a
// comment pair written around the words (%%bm:<name>%% … %%/bm:<name>%%), a
// block id on the block where the words start (^<name>), the words with some
// text before and after them, the heading path above them, and their line.
// Markers are written only where they cannot change what the note means:
// never inside code, frontmatter, math, a link, a comment or table syntax,
// nor inside a heading (whose text is a link target).

import { vaultParser } from './markdown.js'
import { listHeadings } from './sections.js'

const SHORT_WORDS = new Set(
  'a an and are as at be but by for from has have in into is it its of on or our so than that the their then there these this those to was were will with'.split(' '),
)
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CONTEXT = 32 // characters of text kept before and after the words

// ---- names ----

// The name for a bookmark of these words: the first three or four
// significant words, lower case, accents removed, letters, digits and hyphens
// only, under 30 characters, and not one of `taken`; a short random name
// where no word is usable.
export function bookmarkName(words, taken = new Set(), random = Math.random) {
  const plain = String(words)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const all = plain.split(/[^a-z0-9]+/).filter(Boolean)
  const significant = all.filter((w) => !SHORT_WORDS.has(w))
  const pool = significant.length ? significant : all
  let base = ''
  for (const w of pool.slice(0, 4)) {
    const next = base ? `${base}-${w}` : w
    if (next.length > 29) {
      if (!base) base = w.slice(0, 29)
      break
    }
    base = next
  }
  if (!base) base = 'bm-' + Math.floor(random() * 36 ** 5).toString(36).padStart(5, '0')
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 29 - String(n).length - 1)}-${n}`
  return name
}

export function isBookmarkName(name) {
  return typeof name === 'string' && name.length < 40 && NAME.test(name)
}

// The names already used in a note: its block ids and its bookmark markers.
export function namesInNote(text) {
  const names = new Set()
  for (const m of text.matchAll(/[ \t]\^([A-Za-z0-9-]+)[ \t]*$/gm)) names.add(m[1].toLowerCase())
  for (const m of text.matchAll(/%%\/?bm:([a-z0-9-]+)%%/g)) names.add(m[1])
  return names
}

// ---- where markers may go ----

const UNSAFE_INLINE = new Set(['InlineCode', 'Comment', 'Wikilink', 'Embed', 'Link', 'URL', 'Autolink', 'HTMLTag'])

// The note's structure, as the parser that the editor and the link index use
// sees it: paragraphs (with whether each sits in a list item), and the ranges
// where no marker may go.
function structure(text) {
  const paragraphs = []
  const unsafe = []
  vaultParser.parse(text).iterate({
    enter(node) {
      if (node.name === 'Paragraph') {
        const inItem = node.node.parent?.name === 'ListItem'
        paragraphs.push({ from: node.from, to: node.to, inItem })
        return undefined
      }
      if (UNSAFE_INLINE.has(node.name)) {
        unsafe.push([node.from, node.to])
        return false
      }
      return undefined
    },
  })
  // Math is not in the parser's grammar; $$…$$ and $…$ are kept clear by hand.
  for (const m of text.matchAll(/\$\$[\s\S]*?\$\$|(?<![\\$])\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g)) unsafe.push([m.index, m.index + m[0].length])
  return { paragraphs, unsafe }
}

const paragraphAt = (paragraphs, pos) => paragraphs.find((p) => pos >= p.from && pos <= p.to) ?? null

// Moves a selection's ends out of any link, code, comment or math they fall
// inside (`from` to the start of it, `to` to its end).
function widen(unsafe, from, to) {
  for (const [a, b] of unsafe) {
    if (from > a && from < b) from = a
    if (to > a && to < b) to = b
  }
  return { from, to }
}

// A position at the start of a paragraph's continuation line, after the
// line's own prefix (a quote's "> "), is moved past that prefix.
function pastPrefix(text, pos, paragraph) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  if (lineStart <= paragraph.from) return pos
  const prefix = /^[ \t]*(?:>[ \t]?)*/.exec(text.slice(lineStart, paragraph.to))[0]
  return Math.max(pos, lineStart + prefix.length)
}

// Where a bookmark of text[from, to] may write (R2.10): the positions of the
// comment pair (null if it may not be written), and the block id's position
// with the id already there, if any (null if no block id may go).
export function markerPlan(text, from, to) {
  if (!(to > from)) return { pair: null, block: null }
  const { paragraphs, unsafe } = structure(text)
  const wide = widen(unsafe, from, to)
  const first = paragraphAt(paragraphs, wide.from)
  const last = paragraphAt(paragraphs, wide.to)
  let pair = null
  if (first && last) {
    const a = pastPrefix(text, wide.from, first)
    const b = wide.to
    const inside = (pos) => unsafe.some(([x, y]) => pos > x && pos < y)
    if (b > a && !inside(a) && !inside(b)) pair = { from: a, to: b }
  }
  let block = null
  const home = paragraphAt(paragraphs, from) ?? first
  if (home) {
    // A paragraph's block id goes at the end of its last line; one already
    // there is reused.
    const lineStart = text.lastIndexOf('\n', home.to - 1) + 1
    const lastLine = text.slice(lineStart, home.to)
    const existing = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/.exec(lastLine)
    block = { at: home.to, existing: existing ? existing[1] : null }
  }
  return { pair, block }
}

// The note with a bookmark's markers written, and what was written:
// { text, marker: name | null, blockId: id | null, blockIdCreated }.
export function insertMarkers(text, from, to, name) {
  const { pair, block } = markerPlan(text, from, to)
  const changes = []
  if (pair) {
    changes.push({ at: pair.from, insert: `%%bm:${name}%%` })
    changes.push({ at: pair.to, insert: `%%/bm:${name}%%` })
  }
  let blockId = null
  let blockIdCreated = false
  if (block) {
    if (block.existing) blockId = block.existing
    else {
      blockId = name
      blockIdCreated = true
      changes.push({ at: block.at, insert: ` ^${name}` })
    }
  }
  // Applied from the end, so earlier positions stay valid; at one position the
  // pair's end comes before the block id.
  changes.sort((x, y) => y.at - x.at || (x.insert.startsWith(' ^') ? -1 : 1))
  let out = text
  for (const c of changes) out = out.slice(0, c.at) + c.insert + out.slice(c.at)
  return { text: out, marker: pair ? name : null, blockId, blockIdCreated }
}

// The note without a bookmark's comment pair, and without its block id when
// `removeBlockId` is set.
export function removeMarkers(text, name, { removeBlockId = false } = {}) {
  let out = text.split(`%%bm:${name}%%`).join('').split(`%%/bm:${name}%%`).join('')
  if (removeBlockId) {
    const id = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
    out = out.replace(new RegExp(`[ \\t]\\^${id}(?=[ \\t]*(\\r?\\n|$))`, 'g'), '')
  }
  return out
}

// ---- locators ----

const lineOf = (text, pos) => (text.slice(0, pos).match(/\n/g) ?? []).length + 1

// Every bookmark marker, as ranges, so that matching can see past them.
function withoutMarkers(text) {
  const cut = []
  let plain = ''
  let last = 0
  for (const m of text.matchAll(/%%\/?bm:[a-z0-9-]+%%/g)) {
    plain += text.slice(last, m.index)
    cut.push({ at: plain.length, length: m[0].length })
    last = m.index + m[0].length
  }
  plain += text.slice(last)
  // The position in text of a position in plain.
  const back = (pos, end = false) => {
    let shift = 0
    for (const c of cut) {
      if (c.at < pos || (c.at === pos && !end)) shift += c.length
      else break
    }
    return pos + shift
  }
  return { plain, back }
}

// The heading path above a position: the texts of the enclosing headings,
// outermost first.
export function headingPath(text, pos) {
  const line = lineOf(text, pos)
  const path = []
  for (const h of listHeadings(text)) {
    if (h.line > line) break
    while (path.length && path[path.length - 1].level >= h.level) path.pop()
    path.push(h)
  }
  return path.map((h) => h.text.replace(/%%[\s\S]*?%%/g, '').trim())
}

// The locators of a bookmark of text[from, to], taken before any marker is
// written: the words, some text either side, the heading path and the line.
export function captureLocators(text, from, to) {
  const { plain } = withoutMarkers(text)
  // Positions in text map into plain by counting the markers before them.
  const fwd = (pos) => {
    let p = pos
    for (const m of text.slice(0, pos).matchAll(/%%\/?bm:[a-z0-9-]+%%/g)) p -= m[0].length
    return p
  }
  const a = fwd(from)
  const b = fwd(to)
  return {
    quote: { exact: plain.slice(a, b), prefix: plain.slice(Math.max(0, a - CONTEXT), a), suffix: plain.slice(b, b + CONTEXT) },
    heading: headingPath(text, from),
    line: lineOf(text, from),
  }
}

// The words to mark in the rendered preview for a source passage: the
// source with its inline markup taken out, as near as the preview shows it.
export function renderedWords(source) {
  return String(source)
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/!?\[\[([^\]]*)\]\]/g, (m, target) => target.replace(/#\^?/, ' > '))
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==|`)/g, '')
    .replace(/(^|[\s(])[*_]|[*_](?=[\s).,;:!?]|$)/g, '$1')
    .replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---- a selection in the preview, found in the source ----

const MARKUP = new Set(['*', '_', '~', '=', '`'])

// The text as letters to compare: markup characters and syntax dropped,
// spaces collapsed, lower case; with each kept character's offset in text.
function skeleton(text, from = 0, to = text.length) {
  const drop = new Uint8Array(to - from)
  const cut = (a, b) => {
    for (let i = Math.max(a, from); i < Math.min(b, to); i++) drop[i - from] = 1
  }
  const region = text.slice(from, to)
  const each = (re, fn) => {
    for (const m of region.matchAll(re)) fn(from + m.index, m)
  }
  each(/%%[\s\S]*?%%/g, (at, m) => cut(at, at + m[0].length))
  each(/(!?\[\[)([^\]|]*\|)?([^\]]*)(\]\])/g, (at, m) => {
    cut(at, at + m[1].length + (m[2]?.length ?? 0))
    cut(at + m[0].length - 2, at + m[0].length)
  })
  each(/(!?\[)([^\]]*)(\]\([^)]*\))/g, (at, m) => {
    cut(at, at + m[1].length)
    cut(at + m[1].length + m[2].length, at + m[0].length)
  })
  each(/^[ \t]*(?:>[ \t]?)*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)?/gm, (at, m) => cut(at, at + m[0].length))
  each(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, (at, m) => cut(at, at + m[0].length))
  let chars = ''
  const map = []
  for (let i = from; i < to; i++) {
    if (drop[i - from]) continue
    const c = text[i]
    if (MARKUP.has(c)) continue
    if (/\s/.test(c)) {
      if (chars.length && chars[chars.length - 1] !== ' ') {
        chars += ' '
        map.push(i)
      }
      continue
    }
    chars += c.toLowerCase()
    map.push(i)
  }
  return { chars, map }
}

// The source range of text selected in the preview: `rendered` is the
// selection's text, found in the source between lines fromLine and toLine
// (1-based, inclusive). Null when it is not found there; the first match is
// taken.
export function locateRendered(text, fromLine, toLine, rendered) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  const a = starts[Math.max(0, Math.min(fromLine - 1, starts.length - 1))]
  const b = toLine < starts.length ? starts[toLine] : text.length
  const region = skeleton(text, a, b)
  const want = skeleton(String(rendered)).chars.trim()
  if (!want) return null
  const at = region.chars.indexOf(want)
  if (at < 0) return null
  return { from: region.map[at], to: region.map[at + want.length - 1] + 1 }
}

// Finds where a bookmark points in the note now (R2.10), trying its locators
// strongest first. Returns { from, to, line, endLine, by } with by one of
// 'marker', 'block', 'quote', 'heading', 'line', or null for an empty note.
export function resolveBookmark(text, bm) {
  if (!text) return null
  const span = (from, to, by) => ({ from, to, line: lineOf(text, from), endLine: lineOf(text, Math.max(from, to - 1)), by })
  const name = bm.marker
  if (name) {
    const open = `%%bm:${name}%%`
    const a = text.indexOf(open)
    const b = text.indexOf(`%%/bm:${name}%%`, a < 0 ? 0 : a)
    if (a >= 0 && b > a) return span(a + open.length, b, 'marker')
  }
  const { plain, back } = withoutMarkers(text)
  const exact = bm.quote?.exact ?? ''
  const find = (from = 0, to = plain.length) => {
    if (!exact) return -1
    const hay = plain.slice(from, to)
    const ctx = `${bm.quote.prefix ?? ''}${exact}${bm.quote.suffix ?? ''}`
    const withCtx = ctx.length > exact.length ? hay.indexOf(ctx) : -1
    if (withCtx >= 0) return from + withCtx + (bm.quote.prefix ?? '').length
    // The words alone, without the text around them, count only under the
    // bookmark's own heading, so that the same words elsewhere are not taken.
    const section = (bm.heading ?? []).at(-1)
    for (let at = hay.indexOf(exact); at >= 0; at = hay.indexOf(exact, at + 1)) {
      if (!section || headingPath(plain, from + at).at(-1) === section) return from + at
    }
    return -1
  }
  if (bm.blockId) {
    const id = bm.blockId.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
    const m = new RegExp(`[ \\t]\\^${id}[ \\t]*$`, 'm').exec(plain)
    if (m) {
      // The block runs back from its id's line to the blank line before it.
      const lineEnd = m.index
      let start = plain.lastIndexOf('\n\n', lineEnd)
      start = start < 0 ? 0 : start + 2
      const at = find(start, lineEnd)
      if (at >= 0) return span(back(at), back(at + exact.length, true), 'block')
      return span(back(start), back(lineEnd, true), 'block')
    }
  }
  const at = find()
  if (at >= 0) return span(back(at), back(at + exact.length, true), 'quote')
  const path = bm.heading ?? []
  if (path.length) {
    const want = path[path.length - 1].toLowerCase()
    const h = listHeadings(text).find((x) => x.text.replace(/%%[\s\S]*?%%/g, '').trim().toLowerCase() === want)
    if (h) {
      const pos = text.split('\n').slice(0, h.line - 1).join('\n').length + (h.line > 1 ? 1 : 0)
      return { from: pos, to: pos, line: h.line, endLine: h.line, by: 'heading' }
    }
  }
  const lines = text.split('\n').length
  const line = Math.max(1, Math.min(bm.line ?? 1, lines))
  return { from: 0, to: 0, line, endLine: line, by: 'line' }
}

// ---- the stored list ----

// The bookmarks file's contents, made safe to use: { order, items } with
// every item in the order once, newest first, and nothing malformed.
export function normaliseStore(raw) {
  const items = raw && typeof raw.items === 'object' && raw.items ? raw.items : {}
  const clean = {}
  for (const [key, b] of Object.entries(items)) {
    if (!isBookmarkName(key) || !b || typeof b.path !== 'string') continue
    clean[key] = b
  }
  const seen = new Set()
  const order = []
  for (const key of Array.isArray(raw?.order) ? raw.order : []) {
    if (clean[key] && !seen.has(key)) {
      seen.add(key)
      order.push(key)
    }
  }
  const rest = Object.keys(clean)
    .filter((k) => !seen.has(k))
    .sort((a, b) => String(clean[b].created ?? '').localeCompare(String(clean[a].created ?? '')))
  return { order: [...rest, ...order], items: clean }
}

// The store with bookmarks of notes that moved following them (R2.4):
// `moves` is a list of [from, to] note paths.
export function moveInStore(store, moves) {
  const map = new Map(moves)
  let changed = false
  const items = {}
  for (const [key, b] of Object.entries(store.items)) {
    const to = map.get(b.path)
    if (to && to !== b.path) {
      items[key] = { ...b, path: to }
      changed = true
    } else items[key] = b
  }
  return changed ? { ...store, items } : store
}
