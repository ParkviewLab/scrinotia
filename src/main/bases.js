// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// .base files: a YAML definition of filters over the vault's notes and table
// views of their properties. This evaluates a defined subset (filters as
// expressions combined with and/or/not; comparisons, !, &&, ||; file.name,
// file.ext, file.path, file.folder, file.inFolder(), file.hasTag(),
// file.hasLink(), and frontmatter properties; table views with order, sort,
// limit and display names). Anything outside the subset is reported, never
// guessed.

import { parse as parseYaml } from 'yaml'

export class Unsupported extends Error {}

// ---- expressions ----
function tokenize(src) {
  const tokens = []
  const re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(==|!=|>=|<=|&&|\|\||[()!<>,.])|([A-Za-z_][\w-]*))/y
  let m
  let at = 0
  while (at < src.length) {
    re.lastIndex = at
    m = re.exec(src)
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(src.slice(at))) break
      throw new Unsupported(`cannot read expression near “${src.slice(at).trim()}”`)
    }
    at = re.lastIndex
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined) tokens.push({ t: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, '$1') })
    else if (m[3] !== undefined) tokens.push({ t: 'op', v: m[3] })
    else tokens.push({ t: 'id', v: m[4] })
  }
  return tokens
}

export function compile(src) {
  const tokens = tokenize(String(src))
  let i = 0
  const peek = () => tokens[i]
  const take = (v) => {
    const tok = tokens[i]
    if (v !== undefined && (!tok || tok.v !== v)) throw new Unsupported(`expected “${v}” in “${src}”`)
    i++
    return tok
  }
  function primary() {
    const tok = take()
    if (!tok) throw new Unsupported(`incomplete expression “${src}”`)
    if (tok.t === 'num' || tok.t === 'str') return () => tok.v
    if (tok.v === '(') {
      const e = or()
      take(')')
      return e
    }
    if (tok.t !== 'id') throw new Unsupported(`unexpected “${tok.v}” in “${src}”`)
    if (tok.v === 'true') return () => true
    if (tok.v === 'false') return () => false
    const path = [tok.v]
    while (peek()?.v === '.') {
      take('.')
      const next = take()
      if (!next || next.t !== 'id') throw new Unsupported(`bad property path in “${src}”`)
      path.push(next.v)
    }
    if (peek()?.v === '(') {
      take('(')
      const args = []
      if (peek()?.v !== ')') {
        args.push(or())
        while (peek()?.v === ',') {
          take(',')
          args.push(or())
        }
      }
      take(')')
      const name = path.join('.')
      const fn = FUNCTIONS[name]
      if (!fn) throw new Unsupported(`function ${name}() is not supported`)
      return (ctx) => fn(ctx, ...args.map((a) => a(ctx)))
    }
    return (ctx) => lookup(ctx, path)
  }
  function unary() {
    if (peek()?.v === '!') {
      take('!')
      const e = unary()
      return (ctx) => !e(ctx)
    }
    return primary()
  }
  function cmp() {
    const left = unary()
    const op = peek()?.v
    if (['==', '!=', '>', '<', '>=', '<='].includes(op)) {
      take()
      const right = unary()
      return (ctx) => compare(left(ctx), op, right(ctx))
    }
    return left
  }
  function and() {
    let e = cmp()
    while (peek()?.v === '&&') {
      take()
      const a = e
      const b = cmp()
      e = (ctx) => a(ctx) && b(ctx)
    }
    return e
  }
  function or() {
    let e = and()
    while (peek()?.v === '||') {
      take()
      const a = e
      const b = and()
      e = (ctx) => a(ctx) || b(ctx)
    }
    return e
  }
  const e = or()
  if (i < tokens.length) throw new Unsupported(`unexpected “${tokens[i].v}” in “${src}”`)
  return e
}

function compare(a, op, b) {
  if (Array.isArray(a) && (op === '==' || op === '!=')) {
    const has = a.some((x) => String(x) === String(b))
    return op === '==' ? has : !has
  }
  switch (op) {
    case '==':
      return a == b
    case '!=':
      return a != b
    case '>':
      return a > b
    case '<':
      return a < b
    case '>=':
      return a >= b
    default:
      return a <= b
  }
}

const FILE_FIELDS = {
  name: (f) => f.name,
  basename: (f) => f.name,
  ext: (f) => f.ext,
  path: (f) => f.path,
  folder: (f) => f.folder,
  tags: (f) => f.tags,
}

function lookup(ctx, path) {
  const [head, ...rest] = path
  if (head === 'file') {
    if (rest.length !== 1 || !FILE_FIELDS[rest[0]]) throw new Unsupported(`file.${rest.join('.')} is not supported`)
    return FILE_FIELDS[rest[0]](ctx.file)
  }
  let v = head === 'note' ? ctx.note : ctx.note?.[head]
  for (const k of head === 'note' ? rest : rest) v = v?.[k]
  return v
}

const FUNCTIONS = {
  'file.inFolder': (ctx, folder) => {
    const f = String(folder).replace(/^\/+|\/+$/g, '')
    return ctx.file.folder === f || ctx.file.folder.startsWith(f + '/')
  },
  'file.hasTag': (ctx, ...tags) => tags.some((t) => ctx.file.tags.some((x) => x === t || x.startsWith(t + '/'))),
  'file.hasLink': (ctx, target) => ctx.file.links.some((l) => l === target || l.replace(/\.md$/i, '') === target),
}

// ---- filters ----
function compileFilter(node, where) {
  if (node === undefined || node === null) return () => true
  if (typeof node === 'string') return compile(node)
  if (typeof node === 'object' && !Array.isArray(node)) {
    const keys = Object.keys(node)
    if (keys.length !== 1 || !['and', 'or', 'not'].includes(keys[0])) {
      throw new Unsupported(`${where}: expected one of and, or, not`)
    }
    const parts = (node[keys[0]] ?? []).map((n) => compileFilter(n, where))
    if (keys[0] === 'and') return (ctx) => parts.every((p) => p(ctx))
    if (keys[0] === 'or') return (ctx) => parts.some((p) => p(ctx))
    return (ctx) => !parts.some((p) => p(ctx))
  }
  throw new Unsupported(`${where}: unreadable filter`)
}

function columnValue(ctx, key) {
  return compile(key)(ctx)
}

function display(v) {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.map(display).join(', ')
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// entries: [{ path, frontmatter, tags, links }] for every file in the vault.
export function renderBase(source, entries) {
  let def
  try {
    def = parseYaml(source) ?? {}
  } catch (err) {
    return { error: `The .base file is not valid YAML: ${err.message}`, views: [] }
  }
  try {
    const globalFilter = compileFilter(def.filters, 'filters')
    const contexts = entries.map((e) => {
      const name = e.path.slice(e.path.lastIndexOf('/') + 1)
      const dot = name.lastIndexOf('.')
      const folder = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : ''
      return {
        path: e.path,
        file: { path: e.path, name: dot > 0 ? name.slice(0, dot) : name, ext: dot > 0 ? name.slice(dot + 1) : '', folder, tags: e.tags ?? [], links: e.links ?? [] },
        note: e.frontmatter ?? {},
      }
    })
    const included = contexts.filter((c) => globalFilter(c))
    const views = (def.views ?? [{ type: 'table', name: 'Table' }]).map((v, n) => {
      const name = v.name ?? `View ${n + 1}`
      if ((v.type ?? 'table') !== 'table') return { name, error: `${v.type} views are not supported; only tables are` }
      try {
        const viewFilter = compileFilter(v.filters, `view “${name}” filters`)
        const order = v.order ?? ['file.name']
        const columns = order.map((key) => ({ key, label: def.properties?.[key]?.displayName ?? key.replace(/^note\./, '') }))
        let rows = included.filter((c) => viewFilter(c))
        const sorts = (v.sort ?? []).map((s) => ({ get: compile(s.property), dir: String(s.direction ?? 'ASC').toUpperCase() === 'DESC' ? -1 : 1 }))
        rows = rows
          .map((c) => ({ c, keys: sorts.map((s) => s.get(c)) }))
          .sort((a, b) => {
            for (let k = 0; k < sorts.length; k++) {
              const x = display(a.keys[k])
              const y = display(b.keys[k])
              const r = x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })
              if (r) return r * sorts[k].dir
            }
            return a.c.path.localeCompare(b.c.path)
          })
          .map((r) => r.c)
        if (Number.isInteger(v.limit)) rows = rows.slice(0, v.limit)
        return {
          name,
          columns,
          rows: rows.map((c) => ({ path: c.path, cells: columns.map((col) => display(columnValue(c, col.key))) })),
        }
      } catch (err) {
        if (err instanceof Unsupported) return { name, error: err.message }
        throw err
      }
    })
    return { views }
  } catch (err) {
    if (err instanceof Unsupported) return { error: err.message, views: [] }
    throw err
  }
}
