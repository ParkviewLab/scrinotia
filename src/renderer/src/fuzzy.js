// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Fuzzy matching for the quick switcher (R2.5): the query's characters must
// appear in order. A match inside the file name outranks one that needs the
// folder; an exact name, a name that starts with the query, consecutive runs
// and matches at the start of a word score higher; shorter paths win ties.

function subsequence(q, text) {
  let score = 0
  let ti = 0
  let run = 0
  for (const ch of q) {
    const at = text.indexOf(ch, ti)
    if (at < 0) return null
    run = at === ti ? run + 1 : 1
    score += 1 + run * 2
    if (at === 0 || /[\s/_\-.]/.test(text[at - 1])) score += 4
    ti = at + 1
  }
  return score
}

export function fuzzyScore(query, path) {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return 0
  const full = path.toLowerCase()
  const name = full.slice(full.lastIndexOf('/') + 1)
  const compact = name.replace(/\s+/g, '')
  const inName = subsequence(q, name)
  let score
  if (inName !== null) {
    score = inName + 20
    if (compact === q) score += 40
    else if (compact.startsWith(q)) score += 20
  } else {
    score = subsequence(q, full)
    if (score === null) return null
  }
  return score - full.length * 0.05
}

export function fuzzyRank(query, paths, limit = 50) {
  return paths
    .map((p) => ({ p, s: fuzzyScore(query, p.replace(/\.md$/i, '')) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => b.s - a.s || a.p.localeCompare(b.p))
    .slice(0, limit)
    .map((x) => x.p)
}
