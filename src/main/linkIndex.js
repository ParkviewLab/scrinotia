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
import MiniSearch from 'minisearch'
import { htmlText } from './htmlText.js'

const isNote = (p) => /\.md$/i.test(p)
const isPage = (p) => /\.html?$/i.test(p)
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

export function createIndex({ list, read, stat = null }) {
  // list(): every vault-relative file path; read(path): a note's text;
  // stat(path): { size, ctime, mtime } in bytes and milliseconds (optional).
  let files = []
  const notes = new Map() // path -> { text, links, tags }
  const stats = new Map() // path -> { size, ctime, mtime }
  // HTML attachments, searched by their displayed text (R5.5); not notes, so
  // they take no part in links, tags, backlinks or .base views.
  const pages = new Map() // path -> { text, tags: [] }

  async function indexPage(p) {
    try {
      const page = { text: htmlText(await read(p)), tags: [] }
      pages.set(p, page)
      rankedPut(p, page)
    } catch {
      pages.delete(p)
      rankedDrop(p)
    }
  }

  // The ranked text index (R5.4): BM25+ over each note's name, tags and text,
  // kept in step with \`notes\` one document at a time.
  const ranked = new MiniSearch({
    idField: 'path',
    fields: ['title', 'tags', 'body'],
    processTerm: (term) => term.toLowerCase(),
  })
  function rankedPut(path, note) {
    const doc = { path, title: baseName(path).replace(/\.md$/i, ''), tags: note.tags.join(' '), body: note.text }
    if (ranked.has(path)) ranked.replace(doc)
    else ranked.add(doc)
  }
  function rankedDrop(path) {
    if (ranked.has(path)) ranked.discard(path)
  }

  async function statOf(p) {
    if (!stat) return
    try {
      stats.set(p, await stat(p))
    } catch {
      stats.delete(p)
    }
  }

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
    const note = { text, links: parseLinks(text), tags: [...new Set([...parseTags(text), ...fmTags])], frontmatter }
    notes.set(path, note)
    rankedPut(path, note)
  }

  // Reads and stats run in batches, so a large vault is not read one file at a time.
  async function inBatches(items, fn, size = 64) {
    for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn))
  }

  async function rebuild() {
    files = await list()
    notes.clear()
    pages.clear()
    ranked.removeAll()
    stats.clear()
    await inBatches(files, statOf)
    await inBatches(files.filter(isPage), indexPage)
    await inBatches(files.filter(isNote), async (p) => {
      try {
        indexText(p, await read(p))
      } catch {
        // unreadable notes are skipped; they reappear on the next change
      }
    })
  }

  async function update(changed) {
    files = await list()
    const present = new Set(files)
    for (const p of [...notes.keys()]) {
      if (!present.has(p)) {
        notes.delete(p)
        rankedDrop(p)
      }
    }
    for (const p of [...stats.keys()]) if (!present.has(p)) stats.delete(p)
    for (const p of [...pages.keys()]) {
      if (!present.has(p)) {
        pages.delete(p)
        rankedDrop(p)
      }
    }
    for (const p of changed) if (isPage(p) && present.has(p)) await indexPage(p)
    for (const p of files) if (isPage(p) && !pages.has(p)) await indexPage(p)
    for (const p of changed) if (present.has(p)) await statOf(p)
    for (const p of files) if (!stats.has(p)) await statOf(p)
    for (const p of changed) {
      if (!isNote(p) || !present.has(p)) continue
      try {
        indexText(p, await read(p))
      } catch {
        notes.delete(p)
        rankedDrop(p)
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

  // Each tag with the number of notes carrying it or a tag nested under it;
  // a note counts once for a parent however many of its children it has.
  function tags() {
    const counts = new Map()
    for (const note of notes.values()) {
      const names = new Set()
      for (const t of note.tags) {
        const parts = t.split('/')
        for (let i = 1; i <= parts.length; i++) names.add(parts.slice(0, i).join('/'))
      }
      for (const t of names) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  }

  // ---- search (R5) ----
  // Plain words are ranked by BM25+ (all must match; a word matches by its
  // prefix, and words of five letters or more also with one or two typos).
  // "Quoted phrases" must appear exactly; /regular expressions/ must match;
  // -term excludes; tag:, file: and path: restrict. Results without plain
  // words are in path order; with them, best match first.
  function parseQuery(q) {
    const terms = []
    const re = /(-?)(?:(tag|file|path):)?(?:"([^"]*)"|\/((?:\\.|[^/\\])+)\/([a-z]*)|(\S+))/g
    for (const m of q.matchAll(re)) {
      const negate = m[1] === '-'
      const field = m[2] ?? 'text'
      if (m[4] !== undefined) {
        let regex
        try {
          regex = new RegExp(m[4], m[5].includes('i') ? m[5] : m[5] + 'i')
        } catch (err) {
          return { error: `Not a valid regular expression: /${m[4]}/ (${err.message})` }
        }
        terms.push({ negate, field, kind: 'regex', regex })
        continue
      }
      const phrase = m[3] !== undefined
      const value = (m[3] ?? m[6] ?? '').toLowerCase()
      if (!value) continue
      terms.push({ negate, field, kind: phrase ? 'phrase' : 'word', value })
    }
    return { terms }
  }

  function search(q, limit = 200) {
    const { terms, error } = parseQuery(q)
    if (error) return { error, results: [] }
    if (!terms.length) return { results: [] }
    const words = terms.filter((t) => t.kind === 'word' && !t.negate && t.field === 'text').map((t) => t.value)
    let scores = null
    if (words.length) {
      scores = new Map()
      const hits = ranked.search(words.join(' '), {
        combineWith: 'AND',
        prefix: true,
        fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
        boost: { title: 3, tags: 2 },
      })
      for (const h of hits) scores.set(h.id, h.score)
    }
    const results = []
    for (const [path, note] of [...notes, ...pages]) {
      if (scores && !scores.has(path)) continue
      const lowerText = note.text.toLowerCase()
      const lowerPath = path.toLowerCase()
      const test = (t) => {
        const subject = t.field === 'file' ? baseName(path) : t.field === 'path' ? path : null
        if (t.field === 'tag') {
          const want = (t.value ?? '').replace(/^#/, '')
          return note.tags.some((g) => (t.kind === 'regex' ? t.regex.test(g) : g.toLowerCase() === want || g.toLowerCase().startsWith(want + '/')))
        }
        if (t.kind === 'regex') return t.regex.test(subject ?? note.text) || (!subject && t.regex.test(path))
        if (subject) return subject.toLowerCase().includes(t.value)
        // Plain words already matched through the ranked index; this checks
        // the exclusions and phrases.
        if (t.kind === 'word' && !t.negate) return true
        return lowerText.includes(t.value) || lowerPath.includes(t.value)
      }
      if (!terms.every((t) => test(t) !== t.negate)) continue
      // Context lines: where phrases, regular expressions and words occur.
      const matches = []
      const addAt = (at) => {
        const { line, context } = lineAround(note.text, at)
        if (!matches.some((x) => x.line === line)) matches.push({ line, context })
      }
      for (const t of terms) {
        if (t.negate || t.field !== 'text') continue
        if (t.kind === 'regex') {
          const g = new RegExp(t.regex.source, t.regex.flags.includes('g') ? t.regex.flags : t.regex.flags + 'g')
          for (const m of note.text.matchAll(g)) {
            if (matches.length >= 5) break
            addAt(m.index)
            if (m[0] === '') break
          }
          continue
        }
        let at = lowerText.indexOf(t.value)
        while (at >= 0 && matches.length < 5) {
          addAt(at)
          at = lowerText.indexOf(t.value, at + t.value.length)
        }
      }
      results.push({ path, score: scores ? scores.get(path) : null, matches: matches.sort((a, b) => a.line - b.line) })
    }
    results.sort((a, b) => (scores ? b.score - a.score : 0) || a.path.localeCompare(b.path))
    return { results: results.slice(0, limit) }
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
  // Every file, with its stats and, for a note, its frontmatter, tags and
  // links (each { target, path }, path null when unresolved), embeds apart.
  function entries() {
    return files.map((path) => {
      const st = stats.get(path) ?? {}
      const note = notes.get(path)
      if (!note) return { path, ...st, frontmatter: {}, tags: [], links: [], linkTargets: [], embedTargets: [] }
      const resolved = note.links.map((l) => ({ embed: l.embed, target: l.target, path: resolveEntry(l, path, files) }))
      return {
        path,
        ...st,
        frontmatter: note.frontmatter,
        tags: note.tags,
        links: resolved.filter((l) => l.path).map((l) => l.path),
        linkTargets: resolved.filter((l) => !l.embed).map(({ target, path: p }) => ({ target, path: p })),
        embedTargets: resolved.filter((l) => l.embed).map(({ target, path: p }) => ({ target, path: p })),
      }
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
    resolve: (target, from) => (target ? resolveLink(target, from, files) : null),
    has: (p) => notes.has(p),
  }
}
