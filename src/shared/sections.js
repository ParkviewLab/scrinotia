// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The part of a note an embed shows (R3.7): the whole body (without its
// frontmatter), the section under a heading (up to the next heading of the
// same or a higher level), or the paragraph or list item marked ^blockid.

const FRONTMATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/

export function stripFrontmatter(text) {
  return text.replace(FRONTMATTER, '')
}

const normalise = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// Returns the text to show, or null when the heading or block is not found.
export function extractSection(text, subpath) {
  const body = stripFrontmatter(text)
  if (!subpath) return body
  const lines = body.split(/\r?\n/)
  if (subpath.startsWith('^')) {
    const id = subpath.slice(1)
    const marker = new RegExp(`(?:^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
    const at = lines.findIndex((l) => marker.test(l))
    if (at < 0) return null
    // A list item is its own line; a paragraph runs back to the blank line before it.
    if (/^\s*([-*+]|\d+[.)])\s/.test(lines[at])) return lines[at].replace(marker, '')
    let start = at
    while (start > 0 && lines[start - 1].trim() !== '' && !/^#{1,6}\s/.test(lines[start - 1])) start--
    return lines.slice(start, at + 1).join('\n').replace(marker, '')
  }
  const want = normalise(subpath.split('#').pop())
  let inFence = false
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i])
    if (!m) continue
    if (start < 0) {
      if (normalise(m[2]) === want) {
        start = i
        level = m[1].length
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n')
    }
  }
  return start < 0 ? null : lines.slice(start).join('\n')
}

// The headings of a note (R4.6), for the outline: level, text and 1-based
// line number in the whole note, leaving out frontmatter and fenced code.
export function listHeadings(text) {
  const lines = text.split(/\r?\n/)
  const fm = FRONTMATTER.exec(text)
  const skip = fm ? fm[0].split(/\r?\n/).length - 1 : 0
  const out = []
  let inFence = false
  for (let i = skip; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence
    if (inFence) continue
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i])
    if (m && m[2]) out.push({ level: m[1].length, text: m[2].replace(/\s\^[A-Za-z0-9-]+$/, ''), line: i + 1 })
  }
  return out
}
