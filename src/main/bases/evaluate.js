// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The interpreter for .base filters and formulas, over the syntax tree from
// parse.js and the values in values.js. Functions and methods follow the
// references in docs/references/; anything they list that is not implemented
// here is named in UNSUPPORTED and reported when used, never guessed.

import {
  EvalError,
  DateV,
  DurationV,
  LinkV,
  FileV,
  HtmlV,
  ImageV,
  dayjs,
  typeOf,
  isTruthy,
  isPlainObject,
  parseDate,
  parseDuration,
  addDuration,
  formatDate,
  dateDifference,
  relational,
  NoteObj,
  FormulaRef,
  valueEquals,
  compareValues,
  displayText,
  pathOf,
} from './values.js'

// Listed in the references, deliberately not implemented: icon() renders a
// Lucide icon, and the client bundles no icon set.
export const UNSUPPORTED = { functions: ['icon'], fileProperties: [] }

const fail = (msg) => {
  throw new EvalError(msg)
}

const num = (v, what) => (typeof v === 'number' ? v : fail(`${what} needs a number, not ${typeOf(v)}`))

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ---- the evaluation context ----
// row: { entry } for the file being evaluated; vault: { entries, byPath,
// resolve(target, from), backlinks(path) }; formulas: name -> syntax tree;
// thisEntry: the base file (or the note embedding it); now: ms.
export function createContext({ vault, formulas = {}, thisEntry = null, now = Date.now() }) {
  return { vault, formulas, thisEntry, now }
}

function noteObject(entry) {
  return entry?.frontmatter ?? {}
}

// File properties, after the reference's file-property table.
function fileProperty(ctx, entry, name) {
  const path = entry.path
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  switch (name) {
    case 'name':
      return base
    case 'basename':
      return dot > 0 ? base.slice(0, dot) : base
    case 'path':
      return path
    case 'folder':
      return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    case 'ext':
      return dot > 0 ? base.slice(dot + 1) : ''
    case 'size':
      return entry.size ?? null
    case 'ctime':
      return entry.ctime ? new DateV(entry.ctime, true) : null
    case 'mtime':
      return entry.mtime ? new DateV(entry.mtime, true) : null
    case 'tags':
      return (entry.tags ?? []).map((t) => `#${t}`)
    case 'links':
      return (entry.linkTargets ?? []).map((l) => new LinkV(l.target, l.path))
    case 'embeds':
      return (entry.embedTargets ?? []).map((l) => new LinkV(l.target, l.path))
    case 'backlinks':
      return ctx.vault.backlinks(path).map((p) => new LinkV(p.replace(/\.md$/i, ''), p))
    case 'properties':
      return { ...noteObject(entry) }
    case 'file':
      return new FileV(entry)
    default:
      return fail(`file.${name} is not a file property`)
  }
}

function resolveTarget(ctx, target, fromPath) {
  if (target instanceof FileV) return target.entry.path
  if (target instanceof LinkV) return target.path
  if (typeof target !== 'string') return null
  const t = target.replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0]
  return ctx.vault.resolve(t, fromPath)
}

function toLink(ctx, v, fromPath, display = null) {
  if (v instanceof LinkV) return display === null ? v : new LinkV(v.target, v.path, display)
  if (v instanceof FileV) return new LinkV(v.entry.path.replace(/\.md$/i, ''), v.entry.path, display)
  const s = String(v ?? '')
  const inner = s.replace(/^\[\[|\]\]$/g, '')
  const [ref, alias] = inner.split('|')
  return new LinkV(ref, ctx.vault.resolve(ref.split('#')[0], fromPath), display ?? alias ?? null)
}

// ---- evaluation ----
export function evaluate(node, ctx, row, scope = {}) {
  switch (node.k) {
    case 'lit':
      return node.v
    case 're':
      return node.v
    case 'list':
      return node.items.map((n) => evaluate(n, ctx, row, scope))
    case 'id':
      return identifier(node.name, ctx, row, scope)
    case 'member':
      return member(evaluate(node.obj, ctx, row, scope), node.name, ctx, row)
    case 'index': {
      const obj = evaluate(node.obj, ctx, row, scope)
      const key = evaluate(node.key, ctx, row, scope)
      if (Array.isArray(obj)) {
        const i = num(key, 'a list index')
        return obj[i < 0 ? obj.length + i : i] ?? null
      }
      if (obj instanceof NoteObj) return obj.values[String(key)] ?? null
      if (isPlainObject(obj)) return obj[String(key)] ?? null
      if (typeof obj === 'string') return obj[num(key, 'a string index')] ?? null
      return obj === null ? null : fail(`cannot index a ${typeOf(obj)}`)
    }
    case 'call':
      return callGlobal(node, ctx, row, scope)
    case 'method':
      return callMethod(node, ctx, row, scope)
    case 'unary': {
      const v = evaluate(node.arg, ctx, row, scope)
      if (node.op === '!') return !isTruthy(v)
      if (typeof v === 'number') return -v
      if (v instanceof DurationV) return new DurationV(-v.months, -v.ms)
      return fail(`cannot negate a ${typeOf(v)}`)
    }
    case 'bin':
      return binary(node, ctx, row, scope)
    default:
      return fail(`unknown expression node ${node.k}`)
  }
}

function identifier(name, ctx, row, scope) {
  if (Object.prototype.hasOwnProperty.call(scope, name)) return scope[name]
  switch (name) {
    case 'file':
      return new FileV(row.entry)
    case 'note':
      return new NoteObj(noteObject(row.entry))
    case 'formula':
      return new FormulaRef()
    case 'this':
      return ctx.thisEntry ? new FileV(ctx.thisEntry) : null
    default: {
      const v = noteObject(row.entry)[name]
      return v === undefined ? null : v
    }
  }
}

function member(obj, name, ctx, row) {
  if (obj === null || obj === undefined) return null
  if (obj instanceof NoteObj) {
    const v = obj.values[name]
    return v === undefined ? null : v
  }
  if (obj instanceof FormulaRef) return formulaValue(name, ctx, row)
  if (obj instanceof FileV) return fileProperty(ctx, obj.entry, name)
  if (obj instanceof DateV) {
    const d = dayjs(obj.ms)
    const fields = { year: d.year(), month: d.month() + 1, day: d.date(), hour: d.hour(), minute: d.minute(), second: d.second(), millisecond: d.millisecond() }
    if (name in fields) return fields[name]
    return fail(`date.${name} is not a date field`)
  }
  if (obj instanceof DurationV) {
    const units = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000, milliseconds: 1 }
    if (name in units) return Math.trunc(obj.totalMs() / units[name])
    return fail(`duration.${name} is not a duration field`)
  }
  if (typeof obj === 'string' || Array.isArray(obj)) {
    if (name === 'length') return obj.length
    return fail(`${typeOf(obj)}.${name} is not a field`)
  }
  if (obj instanceof LinkV) {
    if (name === 'path') return obj.path
    if (name === 'display') return obj.display
    return fail(`link.${name} is not a field`)
  }
  if (isPlainObject(obj)) {
    const v = obj[name]
    return v === undefined ? null : v
  }
  return fail(`${typeOf(obj)} has no field ${name}`)
}

function formulaValue(name, ctx, row) {
  row.formulaCache ??= new Map()
  if (row.formulaCache.has(name)) {
    const cached = row.formulaCache.get(name)
    if (cached === IN_PROGRESS) return fail(`formula ${name} refers to itself`)
    return cached
  }
  const tree = ctx.formulas[name]
  if (!tree) return fail(`no formula named ${name}`)
  if (tree instanceof Error) throw tree
  row.formulaCache.set(name, IN_PROGRESS)
  try {
    const v = evaluate(tree, ctx, row)
    row.formulaCache.set(name, v)
    return v
  } catch (err) {
    row.formulaCache.delete(name)
    throw err
  }
}
const IN_PROGRESS = Symbol('in progress')

function binary(node, ctx, row, scope) {
  const { op } = node
  if (op === '&&') {
    const l = evaluate(node.l, ctx, row, scope)
    return isTruthy(l) ? isTruthy(evaluate(node.r, ctx, row, scope)) : false
  }
  if (op === '||') {
    const l = evaluate(node.l, ctx, row, scope)
    return isTruthy(l) ? true : isTruthy(evaluate(node.r, ctx, row, scope))
  }
  const a = evaluate(node.l, ctx, row, scope)
  const b = evaluate(node.r, ctx, row, scope)
  switch (op) {
    case '==':
      return valueEquals(a, b)
    case '!=':
      return !valueEquals(a, b)
    case '<':
    case '<=':
    case '>':
    case '>=': {
      if (a === null || b === null) return false
      const r = relational(a, b)
      if (r === null) return false
      return op === '<' ? r < 0 : op === '<=' ? r <= 0 : op === '>' ? r > 0 : r >= 0
    }
    case '+':
      return plus(a, b)
    case '-':
      return minus(a, b)
    case '*':
      if (a instanceof DurationV && typeof b === 'number') return new DurationV(a.months * b, a.ms * b)
      if (typeof a === 'number' && b instanceof DurationV) return new DurationV(b.months * a, b.ms * a)
      return num(a, '*') * num(b, '*')
    case '/':
      if (a instanceof DurationV && typeof b === 'number') return new DurationV(a.months / b, a.ms / b)
      return num(a, '/') / num(b, '/')
    case '%':
      return num(a, '%') % num(b, '%')
    default:
      return fail(`unknown operator ${op}`)
  }
}

function plus(a, b) {
  if (a instanceof DateV) {
    const d = b instanceof DurationV ? b : parseDuration(b)
    return d ? addDuration(a, d) : fail(`cannot add ${typeOf(b)} to a date`)
  }
  if (b instanceof DateV && (a instanceof DurationV || typeof a === 'string')) return plus(b, a)
  if (a instanceof DurationV && b instanceof DurationV) return new DurationV(a.months + b.months, a.ms + b.ms)
  if (typeof a === 'number' && typeof b === 'number') return a + b
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]
  if (typeof a === 'string' || typeof b === 'string') return displayText(a) + displayText(b)
  if (a === null) return b
  if (b === null) return a
  return fail(`cannot add ${typeOf(a)} and ${typeOf(b)}`)
}

function minus(a, b) {
  if (a instanceof DateV) {
    if (b instanceof DateV) return dateDifference(a, b)
    const bd = typeof b === 'string' ? parseDate(b) : null
    if (bd) return dateDifference(a, bd)
    const d = b instanceof DurationV ? b : parseDuration(b)
    return d ? addDuration(a, d, -1) : fail(`cannot subtract ${typeOf(b)} from a date`)
  }
  if (a instanceof DurationV && b instanceof DurationV) return new DurationV(a.months - b.months, a.ms - b.ms)
  return num(a, '-') - num(b, '-')
}

// ---- global functions ----
function callGlobal(node, ctx, row, scope) {
  const name = node.callee
  if (UNSUPPORTED.functions.includes(name)) return fail(`${name}() is not supported`)
  if (name === 'if') {
    if (node.args.length < 2) return fail('if() needs a condition and a result')
    const c = evaluate(node.args[0], ctx, row, scope)
    if (isTruthy(c)) return evaluate(node.args[1], ctx, row, scope)
    return node.args[2] ? evaluate(node.args[2], ctx, row, scope) : null
  }
  const args = node.args.map((a) => evaluate(a, ctx, row, scope))
  switch (name) {
    case 'date': {
      const d = parseDate(args[0])
      return d ?? fail(`date() cannot read “${displayText(args[0])}”`)
    }
    case 'duration': {
      const d = parseDuration(args[0])
      return d ?? fail(`duration() cannot read “${displayText(args[0])}”`)
    }
    case 'now':
      return new DateV(ctx.now, true)
    case 'today':
      return new DateV(dayjs(ctx.now).startOf('day').valueOf(), false)
    case 'min':
    case 'max': {
      const nums = args.flat().filter((v) => v !== null)
      if (!nums.length) return null
      nums.forEach((v) => num(v, `${name}()`))
      return name === 'min' ? Math.min(...nums) : Math.max(...nums)
    }
    case 'number': {
      const v = args[0]
      if (typeof v === 'number') return v
      if (typeof v === 'boolean') return v ? 1 : 0
      if (v instanceof DateV) return v.ms
      if (v instanceof DurationV) return v.totalMs()
      const n = Number(String(v ?? '').trim())
      return String(v ?? '').trim() === '' || Number.isNaN(n) ? fail(`number() cannot read “${displayText(v)}”`) : n
    }
    case 'link':
      return toLink(ctx, args[0], row.entry.path, args[1] === undefined ? null : displayText(args[1]))
    case 'list':
      return Array.isArray(args[0]) ? args[0] : args[0] === null || args[0] === undefined ? [] : [args[0]]
    case 'file': {
      const p = resolveTarget(ctx, args[0], row.entry.path)
      const entry = p ? ctx.vault.byPath.get(p) : null
      return entry ? new FileV(entry) : null
    }
    case 'image': {
      const v = args[0]
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) return new ImageV(v, null)
      return new ImageV(displayText(v), resolveTarget(ctx, v, row.entry.path))
    }
    case 'html':
      return new HtmlV(displayText(args[0]))
    case 'escapeHTML':
      return escapeHtml(displayText(args[0]))
    default:
      return fail(`${name}() is not a function`)
  }
}

// ---- methods, dispatched on the value's type ----
function callMethod(node, ctx, row, scope) {
  const obj = evaluate(node.obj, ctx, row, scope)
  const name = node.name
  const t = typeOf(obj)
  const lazy = t === 'list' && ['filter', 'map', 'reduce'].includes(name)
  const args = lazy ? null : node.args.map((a) => evaluate(a, ctx, row, scope))

  // methods on any value
  if (name === 'isTruthy') return isTruthy(obj)
  if (name === 'isType') return t === String(args[0]).toLowerCase()
  if (name === 'toString') return displayText(obj)
  if (name === 'isEmpty') {
    if (t === 'null') return true
    if (t === 'string' || t === 'list') return obj.length === 0
    if (t === 'object') return Object.keys(obj instanceof NoteObj ? obj.values : obj).length === 0
    return false
  }
  if (t === 'null') return null

  switch (t) {
    case 'string':
      return stringMethod(obj, name, args)
    case 'number':
      return numberMethod(obj, name, args)
    case 'list':
      return lazy ? listLambda(obj, name, node.args, ctx, row, scope) : listMethod(obj, name, args)
    case 'date':
      return dateMethod(obj, name, args, ctx)
    case 'file':
      return fileMethod(obj, name, args, ctx)
    case 'link':
      return linkMethod(obj, name, args, ctx, row)
    case 'regexp':
      if (name === 'matches') return new RegExp(obj.source, obj.flags.replace('g', '')).test(displayText(args[0]))
      break
    case 'object': {
      const o = obj instanceof NoteObj ? obj.values : obj
      if (name === 'keys') return Object.keys(o)
      if (name === 'values') return Object.values(o)
      break
    }
    default:
  }
  return fail(`${t}.${name}() is not a method`)
}

function stringMethod(s, name, args) {
  const str = (i) => displayText(args[i] ?? '')
  switch (name) {
    case 'contains':
      return s.includes(str(0))
    case 'containsAll':
      return args.every((a) => s.includes(displayText(a)))
    case 'containsAny':
      return args.some((a) => s.includes(displayText(a)))
    case 'startsWith':
      return s.startsWith(str(0))
    case 'endsWith':
      return s.endsWith(str(0))
    case 'lower':
      return s.toLowerCase()
    case 'upper':
      return s.toUpperCase()
    case 'title':
      return s.replace(/\p{L}[\p{L}\p{N}']*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    case 'trim':
      return s.trim()
    case 'replace':
      return args[0] instanceof RegExp ? s.replace(args[0], str(1)) : s.split(str(0)).join(str(1))
    case 'repeat':
      return s.repeat(Math.max(0, num(args[0], 'repeat()')))
    case 'reverse':
      return [...s].reverse().join('')
    case 'slice':
      return s.slice(args[0] ?? 0, args[1] ?? undefined)
    case 'split': {
      const parts = args[0] instanceof RegExp ? s.split(args[0]) : s.split(str(0))
      return args[1] === undefined ? parts : parts.slice(0, num(args[1], 'split()'))
    }
    default:
      return fail(`string.${name}() is not a method`)
  }
}

function numberMethod(n, name, args) {
  switch (name) {
    case 'abs':
      return Math.abs(n)
    case 'ceil':
      return Math.ceil(n)
    case 'floor':
      return Math.floor(n)
    case 'round': {
      const digits = args[0] === undefined ? 0 : num(args[0], 'round()')
      const f = 10 ** digits
      return Math.round(n * f) / f
    }
    case 'toFixed':
      return n.toFixed(num(args[0], 'toFixed()'))
    default:
      return fail(`number.${name}() is not a method`)
  }
}

function listMethod(list, name, args) {
  switch (name) {
    case 'contains':
      return list.some((x) => valueEquals(x, args[0]))
    case 'containsAll':
      return args.every((a) => list.some((x) => valueEquals(x, a)))
    case 'containsAny':
      return args.some((a) => list.some((x) => valueEquals(x, a)))
    case 'flat':
      return list.flat(Infinity)
    // mean() is not in the functions reference but is used by its own custom
    // summary example (values.mean()); it averages the numbers in the list.
    case 'mean': {
      const ns = list.filter((v) => typeof v === 'number')
      return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null
    }
    case 'join':
      return list.map(displayText).join(args[0] === undefined ? ', ' : displayText(args[0]))
    case 'reverse':
      return [...list].reverse()
    case 'slice':
      return list.slice(args[0] ?? 0, args[1] ?? undefined)
    case 'sort':
      return [...list].sort((a, b) => (a === null ? 1 : b === null ? -1 : compareValues(a, b)))
    case 'unique':
      return list.filter((x, i) => list.findIndex((y) => valueEquals(x, y)) === i)
    default:
      return fail(`list.${name}() is not a method`)
  }
}

function listLambda(list, name, argNodes, ctx, row, scope) {
  if (!argNodes[0]) return fail(`list.${name}() needs an expression`)
  const body = argNodes[0]
  if (name === 'filter') return list.filter((value, index) => isTruthy(evaluate(body, ctx, row, { ...scope, value, index })))
  if (name === 'map') return list.map((value, index) => evaluate(body, ctx, row, { ...scope, value, index }))
  let acc = argNodes[1] ? evaluate(argNodes[1], ctx, row, scope) : null
  list.forEach((value, index) => {
    acc = evaluate(body, ctx, row, { ...scope, value, index, acc })
  })
  return acc
}

function dateMethod(d, name, args, ctx) {
  switch (name) {
    case 'date':
      return new DateV(dayjs(d.ms).startOf('day').valueOf(), false)
    case 'format':
      return formatDate(d, args[0] === undefined ? undefined : displayText(args[0]))
    case 'time':
      return dayjs(d.ms).format('HH:mm:ss')
    case 'relative':
      return dayjs(d.ms).from(dayjs(ctx.now))
    default:
      return fail(`date.${name}() is not a method`)
  }
}

function fileMethod(f, name, args, ctx) {
  const entry = f.entry
  switch (name) {
    case 'asLink':
      return new LinkV(entry.path.replace(/\.md$/i, ''), entry.path, args[0] === undefined ? null : displayText(args[0]))
    case 'hasLink': {
      const target = resolveTarget(ctx, args[0], entry.path)
      return !!target && (entry.linkTargets ?? []).some((l) => l.path === target)
    }
    case 'hasTag':
      return args.some((t) => {
        const tag = displayText(t).replace(/^#/, '').toLowerCase()
        return (entry.tags ?? []).some((x) => x.toLowerCase() === tag || x.toLowerCase().startsWith(tag + '/'))
      })
    case 'hasProperty':
      return Object.prototype.hasOwnProperty.call(noteObject(entry), displayText(args[0]))
    case 'inFolder': {
      const folder = displayText(args[0]).replace(/^\/+|\/+$/g, '')
      const own = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : ''
      return folder === '' || own === folder || own.startsWith(folder + '/')
    }
    default:
      return fail(`file.${name}() is not a method`)
  }
}

function linkMethod(l, name, args, ctx, row) {
  switch (name) {
    case 'asFile': {
      const entry = l.path ? ctx.vault.byPath.get(l.path) : null
      return entry ? new FileV(entry) : null
    }
    case 'linksTo': {
      const target = resolveTarget(ctx, args[0], row.entry.path)
      return !!target && pathOf(l) === target
    }
    default:
      return fail(`link.${name}() is not a method`)
  }
}

// The names the implementation answers to, for the coverage test.
export const IMPLEMENTED = {
  functions: ['date', 'duration', 'now', 'today', 'if', 'min', 'max', 'number', 'link', 'list', 'file', 'image', 'html', 'escapeHTML'],
  any: ['isTruthy', 'isType', 'toString'],
  date: ['date', 'format', 'time', 'relative', 'isEmpty'],
  dateFields: ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'],
  durationFields: ['days', 'hours', 'minutes', 'seconds', 'milliseconds'],
  string: ['contains', 'containsAll', 'containsAny', 'startsWith', 'endsWith', 'isEmpty', 'lower', 'title', 'trim', 'replace', 'repeat', 'reverse', 'slice', 'split'],
  number: ['abs', 'ceil', 'floor', 'round', 'toFixed', 'isEmpty'],
  list: ['contains', 'containsAll', 'containsAny', 'filter', 'map', 'reduce', 'flat', 'join', 'reverse', 'slice', 'sort', 'unique', 'isEmpty'],
  file: ['asLink', 'hasLink', 'hasTag', 'hasProperty', 'inFolder'],
  link: ['asFile', 'linksTo'],
  object: ['isEmpty', 'keys', 'values'],
  regexp: ['matches'],
  fileProperties: ['name', 'basename', 'path', 'folder', 'ext', 'size', 'ctime', 'mtime', 'tags', 'links', 'backlinks', 'embeds', 'properties'],
}
