// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault's link and text index, held in memory and rebuilt from the files
// (R5.3): every note's text, links and tags. It answers backlinks, unlinked
// mentions and outgoing links (R4.3, R4.4), search (R5), and the link
// rewriting that a rename needs (R2.4).

import { parseLinks, parseTags } from '../shared/markdown.js'
import { resolveLink, resolveRelative } from '../shared/links.js'
import { parse as parseYaml } from 'yaml'

const isNote = (p) => /\.md$/i.test(p)
const baseName = (p) => p.slice(p.lastIndexOf('/') + 1)
const folderOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const stem = (p) => baseName(p).replace(/\.md$/i, '')

function lineAround(text, at) {
  const start = text.lastIndexOf('\n', at - 1) + 1
  let end = text.indexOf('\n', at)
  if (end < 0) end = text.length
  return { line: text.slice(0, start).split('\n').length, context: text.slice(start, end).replace(/\r$/, '').trim() }
}

function resolveEntry(link, from, files) {
  if (link.kind === 'markdown') return resolveRelative(link.target, from, files)
  if (!link.target) return link.subpath ? from : null
  return resolveLink(link.target, from, files)
}

export function createIndex({ list, read }) {
  // list(): every vault-relative file path; read(path): a note's text.
  let files = []
  const notes = new Map() // path -> { text, links, tags }

  function frontmatterOf(text) {
    const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(text)
    if (!m) return {}
    try {
      const fm = parseYaml(m[1])
      return fm && typeof fm === 'object' && !Array.isArray(fm) ? fm : {}
    } catch {
      return {}
    }
  }

  function indexText(path, text) {
    const frontmatter = frontmatterOf(text)
    const fmTags = [frontmatter.tags ?? []].flat().map((t) => String(t).replace(/^#/, ''))
    notes.set(path, { text, links: parseLinks(text), tags: [...new Set([...parseTags(text), ...fmTags])], frontmatter })
  }

  async function rebuild() {
    files = await list()
    notes.clear()
    for (const p of files.filter(isNote)) {
      try {
        indexText(p, await read(p))
      } catch {
        // unreadable notes are skipped; they reappear on the next change
      }
    }
  }

  async function update(changed) {
    files = await list()
    const present = new Set(files)
    for (const p of [...notes.keys()]) if (!present.has(p)) notes.delete(p)
    for (const p of changed) {
      if (!isNote(p) || !present.has(p)) continue
      try {
        indexText(p, await read(p))
      } catch {
        notes.delete(p)
      }
    }
    // A changed folder may hide new notes; index any note not yet known.
    for (const p of files) if (isNote(p) && !notes.has(p)) indexText(p, await read(p))
  }

  function backlinks(target) {
    const out = []
    for (const [source, note] of notes) {
      for (const link of note.links) {
        if (resolveEntry(link, source, files) === target && !(source === target && link.kind === 'wikilink' && !link.target)) {
          out.push({ source, ...lineAround(note.text, link.from) })
        }
      }
    }
    return out.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line)
  }

  // Plain-text occurrences of the note's name outside links, in other notes.
  function unlinkedMentions(target) {
    const name = stem(target)
    if (name.length < 2) return []
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu')
    const out = []
    for (const [source, note] of notes) {
      if (source === target) continue
      for (const m of note.text.matchAll(re)) {
        if (note.links.some((l) => m.index >= l.from && m.index < l.to)) continue
        out.push({ source, ...lineAround(note.text, m.index) })
      }
    }
    return out.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line)
  }

  function outgoing(source) {
    const note = notes.get(source)
    if (!note) return []
    return note.links.map((link) => ({
      text: link.alias ?? (link.target || `#${link.subpath ?? ''}`),
      target: link.target,
      embed: link.embed,
      resolved: resolveEntry(link, source, files),
    }))
  }

  function tags() {
    const counts = new Map()
    for (const note of notes.values()) for (const t of new Set(note.tags)) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  }

  // ---- search (R5) ----
  // Terms: words and "quoted phrases" (all must match, case-insensitively),
  // -term to exclude, and tag:, file:, path: restrictions.
  function parseQuery(q) {
    const terms = []
    const re = /(-?)(?:(tag|file|path):)?(?:"([^"]*)"|(\S+))/g
    for (const m of q.matchAll(re)) {
      const value = (m[3] ?? m[4] ?? '').toLowerCase()
      if (!value) continue
      terms.push({ negate: m[1] === '-', field: m[2] ?? 'text', value })
    }
    return terms
  }

  function search(q, limit = 200) {
    const terms = parseQuery(q)
    if (terms.length === 0) return []
    const results = []
    for (const [path, note] of notes) {
      const lowerText = note.text.toLowerCase()
      const lowerPath = path.toLowerCase()
      const test = (t) => {
        if (t.field === 'tag') return note.tags.some((g) => g.toLowerCase() === t.value.replace(/^#/, '') || g.toLowerCase().startsWith(t.value.replace(/^#/, '') + '/'))
        if (t.field === 'file') return baseName(lowerPath).includes(t.value)
        if (t.field === 'path') return lowerPath.includes(t.value)
        return lowerText.includes(t.value) || lowerPath.includes(t.value)
      }
      if (!terms.every((t) => test(t) !== t.negate)) continue
      const matches = []
      for (const t of terms) {
        if (t.negate || t.field !== 'text') continue
        let at = lowerText.indexOf(t.value)
        while (at >= 0 && matches.length < 5) {
          const { line, context } = lineAround(note.text, at)
          if (!matches.some((x) => x.line === line)) matches.push({ line, context })
          at = lowerText.indexOf(t.value, at + t.value.length)
        }
      }
      results.push({ path, matches: matches.sort((a, b) => a.line - b.line) })
      if (results.length >= limit) break
    }
    return results.sort((a, b) => a.path.localeCompare(b.path))
  }

  // ---- link rewriting for a rename or move (R2.4) ----
  // moves: [[oldPath, newPath], ...] for every file that moved. Returns
  // [{ path (after the move), text }] for each note whose links must change.
  // Only the target text of each affected link changes; subpaths, aliases
  // and everything else are left byte-for-byte.
  function planRename(moves) {
    const moved = new Map(moves)
    const after = files.map((f) => moved.get(f) ?? f)
    const edits = []
    for (const [source, note] of notes) {
      const changes = []
      for (const link of note.links) {
        const old = resolveEntry(link, source, files)
        if (!old) continue
        const sourceAfter = moved.get(source) ?? source
        let dest = moved.get(old)
        if (!dest) {
          // Not a link to a moved file, but the move may capture it (a new
          // file of the same name, nearer or shorter): pin it to its target.
          if (link.kind !== 'wikilink' || !link.target) continue
          if (resolveLink(link.target, sourceAfter, after) === old) continue
          dest = old
        }
        const span = note.text.slice(link.targetFrom, link.targetTo)
        if (link.kind === 'wikilink') {
          if (!link.target) continue
          const hash = span.indexOf('#')
          const suffix = hash < 0 ? '' : span.slice(hash)
          const keepExt = /\.md$/i.test(link.target) || !isNote(dest)
          const short = keepExt ? baseName(dest) : stem(dest)
          const full = keepExt ? dest : dest.replace(/\.md$/i, '')
          const usedPath = link.target.includes('/') || !moved.has(old)
          let next = usedPath ? full : short
          if (resolveLink(next, sourceAfter, after) !== dest) next = full
          if (next + suffix !== span) changes.push({ from: link.targetFrom, to: link.targetTo, insert: next + suffix })
        } else {
          const hash = span.indexOf('#')
          const suffix = hash < 0 ? '' : span.slice(hash)
          const fromParts = folderOf(sourceAfter).split('/').filter(Boolean)
          const toParts = dest.split('/')
          let i = 0
          while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++
          let rel = [...fromParts.slice(i).map(() => '..'), ...toParts.slice(i)].join('/')
          if (/%20|%[0-9A-F]{2}/i.test(span) || /\s/.test(rel)) rel = rel.split('/').map(encodeURIComponent).join('/')
          if (rel + suffix !== span) changes.push({ from: link.targetFrom, to: link.targetTo, insert: rel + suffix })
        }
      }
      if (changes.length === 0) continue
      let text = note.text
      for (const c of changes.sort((a, b) => b.from - a.from)) text = text.slice(0, c.from) + c.insert + text.slice(c.to)
      edits.push({ path: moved.get(source) ?? source, before: note.text, text })
    }
    return edits
  }

  // Every file, with a note's frontmatter, tags and resolved link targets (for .base views).
  function entries() {
    return files.map((path) => {
      const note = notes.get(path)
      if (!note) return { path, frontmatter: {}, tags: [], links: [] }
      const links = note.links.map((l) => resolveEntry(l, path, files)).filter(Boolean)
      return { path, frontmatter: note.frontmatter, tags: note.tags, links }
    })
  }

  return {
    entries,
    rebuild,
    update,
    backlinks,
    unlinkedMentions,
    outgoing,
    tags,
    search,
    planRename,
    files: () => files,
    has: (p) => notes.has(p),
  }
}
