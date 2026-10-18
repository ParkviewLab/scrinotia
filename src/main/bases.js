// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// .base files (R3.6), implemented from the references in docs/references/:
// the YAML definition is read, its filters select entries, its formulas are
// evaluated per entry, and each view becomes typed rows for the renderer.
// A construct the client does not implement is reported, never guessed; an
// expression that fails on one entry marks that cell, and an entry whose
// filter fails is left out and counted in the view's notices.

import { parse as parseYaml } from 'yaml'
import { parse, parsePropertyId, Unsupported } from './bases/parse.js'
import { evaluate, createContext } from './bases/evaluate.js'
import { summarise } from './bases/summaries.js'
import { EvalError, ErrorV, LinkV, FileV, HtmlV, ImageV, DateV, DurationV, typeOf, isTruthy, compareValues, valueEquals, displayText, formatDate, formatDuration } from './bases/values.js'

export { Unsupported }

const VIEW_TYPES = ['table', 'cards', 'list']
const LATER_VIEW_TYPES = []

// filters: a string, or a tree with exactly one of and, or, not.
function compileFilter(node, where) {
  if (node === undefined || node === null) return null
  if (typeof node === 'string' || typeof node === 'boolean') {
    const tree = parse(String(node))
    return (ctx, row) => isTruthy(evaluate(tree, ctx, row))
  }
  if (typeof node === 'object' && !Array.isArray(node)) {
    const keys = Object.keys(node)
    if (keys.length !== 1 || !['and', 'or', 'not'].includes(keys[0])) throw new Unsupported(`${where}: expected exactly one of and, or, not`)
    const parts = [node[keys[0]] ?? []].flat().map((n) => compileFilter(n, where)).filter(Boolean)
    if (keys[0] === 'and') return (ctx, row) => parts.every((p) => p(ctx, row))
    if (keys[0] === 'or') return (ctx, row) => parts.some((p) => p(ctx, row))
    return (ctx, row) => !parts.some((p) => p(ctx, row))
  }
  throw new Unsupported(`${where}: unreadable filter`)
}

// A property id's value for one row; formulas and file properties go
// through the interpreter, note properties are read directly by name.
function propertyValue(id, ctx, row) {
  const { type, name } = parsePropertyId(id)
  if (type === 'note') {
    const v = row.entry.frontmatter?.[name]
    return v === undefined ? null : v
  }
  return evaluate({ k: 'member', obj: { k: 'id', name: type }, name }, ctx, row)
}

// A cell for one row, with wikilinks written as text (in frontmatter)
// resolved from the row's own note.
function cellFor(id, ctx, row) {
  const cell = toCell(safeValue(id, ctx, row))
  const fix = (c) => {
    if (c.t === 'link' && !c.path && c.target) return { ...c, path: ctx.vault.resolve(c.target, row.entry.path) }
    if (c.t === 'list') return { ...c, items: c.items.map(fix) }
    return c
  }
  return fix(cell)
}

function safeValue(id, ctx, row) {
  try {
    return propertyValue(id, ctx, row)
  } catch (err) {
    if (err instanceof EvalError || err instanceof Unsupported) return new ErrorV(err.message)
    throw err
  }
}

const isPlainMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Typed cells for the renderer.
export function toCell(v) {
  switch (typeOf(v)) {
    case 'null':
      return { t: 'empty', text: '' }
    case 'boolean':
      return { t: 'bool', v, text: String(v) }
    case 'number':
      return { t: 'number', text: Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6) }
    case 'string': {
      const m = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/.exec(v.trim())
      if (m) return { t: 'link', target: m[1], path: null, text: m[2] ?? m[1] }
      return { t: 'text', text: v }
    }
    case 'date':
      return { t: 'date', text: formatDate(v) }
    case 'duration':
      return { t: 'text', text: formatDuration(v) }
    case 'list':
      return { t: 'list', items: v.map(toCell) }
    case 'link':
      return { t: 'link', target: v.target, path: v.path, text: v.display ?? v.target }
    case 'file':
      return { t: 'link', target: v.entry.path, path: v.entry.path, text: displayText(v) }
    case 'html':
      return { t: 'html', html: v.html }
    case 'image':
      return { t: 'image', path: v.path, src: v.path ? null : v.target, text: v.target }
    case 'error':
      return { t: 'error', text: v.message }
    default:
      return { t: 'text', text: displayText(v) }
  }
}

// The reference's default display name: the name without its type prefix.
function defaultLabel(id) {
  return parsePropertyId(id).name
}

// entries: every file of the vault from the index; vault: { resolve(target,
// from) }; basePath: the .base file's own path (for `this`); now: ms.
export function renderBase(source, entries, { basePath = null, resolve = () => null, now = Date.now() } = {}) {
  let def
  try {
    def = parseYaml(source) ?? {}
  } catch (err) {
    return { error: `The .base file is not valid YAML: ${err.message}`, views: [] }
  }
  if (typeof def !== 'object' || Array.isArray(def)) return { error: 'The .base file must be a YAML mapping.', views: [] }

  const byPath = new Map(entries.map((e) => [e.path, e]))
  const backlinkMap = new Map()
  for (const e of entries) for (const p of e.links ?? []) if (p !== e.path) backlinkMap.set(p, [...(backlinkMap.get(p) ?? []), e.path])
  const vault = { entries, byPath, resolve, backlinks: (p) => [...new Set(backlinkMap.get(p) ?? [])] }

  const formulas = {}
  for (const [name, src] of Object.entries(def.formulas ?? {})) {
    try {
      formulas[name] = parse(String(src))
    } catch (err) {
      formulas[name] = new EvalError(`formula ${name}: ${err.message}`)
    }
  }
  const ctx = createContext({ vault, formulas, thisEntry: basePath ? byPath.get(basePath) ?? { path: basePath, frontmatter: {} } : null, now })
  const notices = []
  for (const key of Object.keys(def)) {
    if (!['filters', 'formulas', 'properties', 'summaries', 'views'].includes(key)) notices.push(`The key “${key}” is not part of the format and is ignored.`)
  }
  const customSummaries = {}
  for (const [name, src] of Object.entries(def.summaries ?? {})) {
    try {
      customSummaries[name] = parse(String(src))
    } catch (err) {
      customSummaries[name] = new EvalError(`summary ${name}: ${err.message}`)
    }
  }

  let globalFilter
  try {
    globalFilter = compileFilter(def.filters, 'filters')
  } catch (err) {
    if (err instanceof Unsupported) return { error: err.message, views: [] }
    throw err
  }

  const rowsFor = (filter) => {
    const out = []
    let failed = 0
    for (const entry of entries) {
      const row = { entry }
      try {
        if (globalFilter && !globalFilter(ctx, row)) continue
        if (filter && !filter(ctx, row)) continue
        out.push(row)
      } catch (err) {
        if (!(err instanceof EvalError || err instanceof Unsupported)) throw err
        failed++
      }
    }
    return { rows: out, failed }
  }

  const views = (def.views ?? [{ type: 'table', name: 'Table' }]).map((v, n) => {
    const name = String(v?.name ?? `View ${n + 1}`)
    const type = String(v?.type ?? 'table')
    if (!VIEW_TYPES.includes(type)) {
      return { name, type, error: LATER_VIEW_TYPES.includes(type) ? `${type} views are not supported yet` : `${type} views are not supported` }
    }
    try {
      const viewNotices = []
      const { rows, failed } = rowsFor(compileFilter(v.filters, `view “${name}” filters`))
      if (failed) viewNotices.push(`${failed} ${failed === 1 ? 'entry was' : 'entries were'} left out because a filter could not be evaluated for ${failed === 1 ? 'it' : 'them'}.`)
      const order = Array.isArray(v.order) && v.order.length ? v.order.map(String) : ['file.name']
      const columns = order.map((id) => ({ id, label: def.properties?.[id]?.displayName ?? defaultLabel(id), type: parsePropertyId(id).type }))

      const sorts = (Array.isArray(v.sort) ? v.sort : []).map((s) => ({ id: String(s.property), dir: String(s.direction ?? 'ASC').toUpperCase() === 'DESC' ? -1 : 1 }))
      const keyed = rows.map((row) => ({ row, keys: sorts.map((s) => safeValue(s.id, ctx, row)) }))
      keyed.sort((a, b) => {
        for (let k = 0; k < sorts.length; k++) {
          const x = a.keys[k]
          const y = b.keys[k]
          const xNull = x === null || x instanceof ErrorV
          const yNull = y === null || y instanceof ErrorV
          if (xNull || yNull) {
            if (xNull && yNull) continue
            return xNull ? 1 : -1
          }
          const r = compareValues(x, y)
          if (r) return r * sorts[k].dir
        }
        return a.row.entry.path.localeCompare(b.row.entry.path)
      })
      let sorted = keyed.map((k) => k.row)
      const limit = Number(v.limit)
      if (Number.isInteger(limit) && limit >= 0) sorted = sorted.slice(0, limit)

      // Summaries: view.summaries maps a property id to a summary name.
      const summaryFor = isPlainMapping(v.summaries) ? v.summaries : {}
      const summaryRow = (rowsIn) =>
        columns.map((c) => {
          const name = summaryFor[c.id]
          if (!name) return null
          const values = rowsIn.map((row) => safeValue(c.id, ctx, row))
          return { name: String(name), cell: toCell(summarise(String(name), values, { ctx, customs: customSummaries, row: { entry: ctx.thisEntry ?? { path: '', frontmatter: {} } } })) }
        })
      const hasSummaries = columns.some((c) => summaryFor[c.id])
      const rowOut = (row) => ({ path: row.entry.path, cells: columns.map((c) => cellFor(c.id, ctx, row)) })

      // Grouping: rows (already sorted and limited) grouped by one property;
      // groups ordered by their value in the given direction, empty last, or
      // by groupOrder where the view lists one.
      let groups = null
      if (v.groupBy) {
        const gid = String(isPlainMapping(v.groupBy) ? v.groupBy.property : v.groupBy)
        const gdir = String((isPlainMapping(v.groupBy) && v.groupBy.direction) || 'ASC').toUpperCase() === 'DESC' ? -1 : 1
        const buckets = []
        for (const row of sorted) {
          const key = safeValue(gid, ctx, row)
          const k = key instanceof ErrorV ? null : key
          let b = buckets.find((x) => (x.key === null ? k === null : k !== null && valueEquals(x.key, k)))
          if (!b) buckets.push((b = { key: k, rows: [] }))
          b.rows.push(row)
        }
        if (Array.isArray(v.groupOrder)) {
          const ordered = []
          for (const want of v.groupOrder) {
            const b = buckets.find((x) => (want === null ? x.key === null : x.key !== null && valueEquals(x.key, want)))
            if (b) ordered.push(b)
          }
          buckets.splice(0, buckets.length, ...ordered)
        } else {
          buckets.sort((a, b) => (a.key === null ? 1 : b.key === null ? -1 : compareValues(a.key, b.key) * gdir))
        }
        groups = buckets.map((b) => ({
          key: b.key === null ? { t: 'empty', text: '' } : toCell(b.key),
          rows: b.rows.map(rowOut),
          summaries: hasSummaries ? summaryRow(b.rows) : null,
        }))
      }
      return {
        name,
        type,
        columns,
        notices: viewNotices,
        rows: sorted.map(rowOut),
        groups,
        summaries: hasSummaries ? summaryRow(sorted) : null,
      }
    } catch (err) {
      if (err instanceof Unsupported) return { name, type, error: err.message }
      throw err
    }
  })
  return { views, notices }
}

// Exposed for tests: evaluate one expression against one entry.
export function evaluateExpression(src, entry, { entries = [entry], resolve = () => null, formulas = {}, now = Date.now(), basePath = null } = {}) {
  const byPath = new Map(entries.map((e) => [e.path, e]))
  const parsed = Object.fromEntries(Object.entries(formulas).map(([k, f]) => [k, parse(f)]))
  const backlinkMap = new Map()
  for (const e of entries) for (const p of e.links ?? []) if (p !== e.path) backlinkMap.set(p, [...(backlinkMap.get(p) ?? []), e.path])
  const ctx = createContext({ vault: { entries, byPath, resolve, backlinks: (p) => backlinkMap.get(p) ?? [] }, formulas: parsed, thisEntry: basePath ? byPath.get(basePath) : null, now })
  return evaluate(parse(src), ctx, { entry })
}

export { LinkV, FileV, HtmlV, ImageV, DateV, DurationV }
