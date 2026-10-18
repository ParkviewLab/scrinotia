// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Value types of the .base formula language, after the Value classes of the
// reference type definitions: null, boolean, number and string are plain
// JavaScript values; a list is an array; an object is a plain object; the
// rest are the classes below.

import dayjs from 'dayjs'
import advancedFormat from 'dayjs/plugin/advancedFormat.js'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'
import relativeTime from 'dayjs/plugin/relativeTime.js'

dayjs.extend(advancedFormat)
dayjs.extend(customParseFormat)
dayjs.extend(relativeTime)

export { dayjs }

export class EvalError extends Error {}

export class DateV {
  constructor(ms, hasTime = true) {
    this.ms = ms
    this.hasTime = hasTime
  }
}

// Months are kept apart from fixed-length time, so "1M" adds a calendar month.
export class DurationV {
  constructor(months, ms) {
    this.months = months
    this.ms = ms
  }
  totalMs() {
    return this.ms + this.months * 30.436875 * 86400000
  }
}

export class LinkV {
  // path: the vault path it resolves to, or null; target: the text linked to.
  constructor(target, path, display = null) {
    this.target = target
    this.path = path
    this.display = display
  }
}

export class FileV {
  constructor(entry) {
    this.entry = entry
  }
}

export class HtmlV {
  constructor(html) {
    this.html = html
  }
}

export class ImageV {
  constructor(target, path) {
    this.target = target
    this.path = path
  }
}

// The `note` and `formula` names in an expression.
export class NoteObj {
  constructor(values) {
    this.values = values
  }
}

export class FormulaRef {}

export class ErrorV {
  constructor(message) {
    this.message = message
  }
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

export function typeOf(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return 'boolean'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'string') return 'string'
  if (Array.isArray(v)) return 'list'
  if (v instanceof DateV) return 'date'
  if (v instanceof DurationV) return 'duration'
  if (v instanceof LinkV) return 'link'
  if (v instanceof FileV) return 'file'
  if (v instanceof RegExp) return 'regexp'
  if (v instanceof HtmlV) return 'html'
  if (v instanceof ImageV) return 'image'
  if (v instanceof ErrorV) return 'error'
  if (isPlainObject(v) || v instanceof NoteObj) return 'object'
  return 'unknown'
}

export function isTruthy(v) {
  switch (typeOf(v)) {
    case 'null':
      return false
    case 'boolean':
      return v
    case 'number':
      return v !== 0 && !Number.isNaN(v)
    case 'string':
      return v.length > 0
    case 'list':
      return v.length > 0
    case 'object':
      return Object.keys(v instanceof NoteObj ? v.values : v).length > 0
    case 'error':
      return false
    default:
      return true
  }
}

// ---- dates and durations ----
const DATE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD']

export function parseDate(s) {
  if (s instanceof DateV) return s
  if (s instanceof Date) return new DateV(s.getTime(), true)
  if (typeof s === 'number') return new DateV(s, true)
  if (typeof s !== 'string') return null
  const t = s.trim()
  for (const f of DATE_FORMATS) {
    const d = dayjs(t, f, true)
    if (d.isValid()) return new DateV(d.valueOf(), f !== 'YYYY-MM-DD')
  }
  const loose = dayjs(t)
  return loose.isValid() && /\d{4}-\d{2}-\d{2}/.test(t) ? new DateV(loose.valueOf(), /\d:\d/.test(t)) : null
}

const UNITS = [
  [/^(y|yr|yrs|year|years)$/, 'month', 12],
  [/^(M|month|months)$/, 'month', 1],
  [/^(w|week|weeks)$/, 'ms', 7 * 86400000],
  [/^(d|day|days)$/, 'ms', 86400000],
  [/^(h|hr|hrs|hour|hours)$/, 'ms', 3600000],
  [/^(m|min|mins|minute|minutes)$/, 'ms', 60000],
  [/^(s|sec|secs|second|seconds)$/, 'ms', 1000],
  [/^(ms|millisecond|milliseconds)$/, 'ms', 1],
]

export function parseDuration(s) {
  if (s instanceof DurationV) return s
  if (typeof s !== 'string') return null
  const re = /([+-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)/g
  let months = 0
  let ms = 0
  let found = false
  let rest = s
  for (const m of s.matchAll(re)) {
    const unit = UNITS.find(([u]) => u.test(m[2]))
    if (!unit) return null
    found = true
    if (unit[1] === 'month') months += Number(m[1]) * unit[2]
    else ms += Number(m[1]) * unit[2]
    rest = rest.replace(m[0], '')
  }
  if (!found || rest.replace(/[\s,]/g, '') !== '') return null
  return new DurationV(months, ms)
}

export function addDuration(date, dur, sign = 1) {
  let d = dayjs(date.ms)
  if (dur.months) {
    const whole = Math.trunc(dur.months)
    d = d.add(sign * whole, 'month')
    const frac = dur.months - whole
    if (frac) d = d.add(sign * frac * 30.436875 * 86400000, 'millisecond')
  }
  d = d.add(sign * dur.ms, 'millisecond')
  return new DateV(d.valueOf(), date.hasTime || dur.ms % 86400000 !== 0)
}

// The difference between two dates, counted in local calendar time: a day
// that a daylight-saving change makes 23 or 25 hours long still counts as one.
export function dateDifference(a, b) {
  const offset = (dayjs(a.ms).utcOffset() - dayjs(b.ms).utcOffset()) * 60000
  return new DurationV(0, a.ms - b.ms + offset)
}

// Ordering for the relational operators: defined only for values of the same
// type (a date against a date-like text, and links against files, count as
// the same); otherwise there is no order and the comparison is false.
export function relational(a, b) {
  const ta = typeOf(a)
  const tb = typeOf(b)
  if (ta === 'date' || tb === 'date') {
    const da = parseDate(a)
    const db = parseDate(b)
    return da && db ? da.ms - db.ms : null
  }
  const linkish = (t) => t === 'link' || t === 'file'
  if (ta !== tb && !(linkish(ta) && linkish(tb))) return null
  if (!['number', 'string', 'boolean', 'duration', 'link', 'file', 'list'].includes(ta)) return null
  return compareValues(a, b)
}

export function formatDate(v, pattern) {
  return dayjs(v.ms).format(pattern ?? (v.hasTime ? 'YYYY-MM-DD HH:mm' : 'YYYY-MM-DD'))
}

export function formatDuration(v) {
  const total = v.totalMs()
  const sign = total < 0 ? '-' : ''
  let rest = Math.abs(total)
  const parts = []
  for (const [unit, size] of [
    ['d', 86400000],
    ['h', 3600000],
    ['m', 60000],
    ['s', 1000],
  ]) {
    const n = Math.floor(rest / size)
    if (n) parts.push(`${n}${unit}`)
    rest -= n * size
  }
  return sign + (parts.join(' ') || '0s')
}

// ---- equality and order ----
export function valueEquals(a, b) {
  const ta = typeOf(a)
  const tb = typeOf(b)
  if (ta === 'null' || tb === 'null') return ta === tb
  if (ta === 'date' || tb === 'date') {
    const da = parseDate(a)
    const db = parseDate(b)
    return !!da && !!db && da.ms === db.ms
  }
  if (ta === 'duration' && tb === 'duration') return a.totalMs() === b.totalMs()
  if ((ta === 'link' || ta === 'file') && (tb === 'link' || tb === 'file')) return pathOf(a) !== null && pathOf(a) === pathOf(b)
  if (ta === 'list' && tb === 'list') return a.length === b.length && a.every((x, i) => valueEquals(x, b[i]))
  if (ta === 'link' && tb === 'string') return a.target === b || a.path === b
  if (tb === 'link' && ta === 'string') return b.target === a || b.path === a
  if (ta !== tb) return false
  if (ta === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

export function pathOf(v) {
  if (v instanceof FileV) return v.entry.path
  if (v instanceof LinkV) return v.path
  return null
}

const RANK = { boolean: 0, number: 1, date: 2, duration: 3, string: 4, link: 5, file: 5, list: 6, object: 7 }

// A total order for sorting: same-typed values by their natural order,
// different types by type; null and errors are handled by the caller (last).
export function compareValues(a, b) {
  const ta = typeOf(a)
  const tb = typeOf(b)
  if (ta === 'date' || tb === 'date') {
    const da = parseDate(a)
    const db = parseDate(b)
    if (da && db) return da.ms - db.ms
  }
  if (ta !== tb && !((ta === 'link' || ta === 'file') && (tb === 'link' || tb === 'file'))) return (RANK[ta] ?? 9) - (RANK[tb] ?? 9)
  switch (ta) {
    case 'boolean':
      return Number(a) - Number(b)
    case 'number':
      return a - b
    case 'duration':
      return a.totalMs() - b.totalMs()
    case 'string':
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    case 'link':
    case 'file':
      return displayText(a).localeCompare(displayText(b), undefined, { numeric: true, sensitivity: 'base' })
    case 'list': {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const r = compareValues(a[i], b[i])
        if (r) return r
      }
      return a.length - b.length
    }
    default:
      return displayText(a).localeCompare(displayText(b))
  }
}

export function displayText(v) {
  switch (typeOf(v)) {
    case 'null':
      return ''
    case 'boolean':
    case 'number':
      return String(v)
    case 'string':
      return v
    case 'date':
      return formatDate(v)
    case 'duration':
      return formatDuration(v)
    case 'list':
      return v.map(displayText).join(', ')
    case 'link':
      return v.display ?? v.target
    case 'file':
      return v.entry.path.slice(v.entry.path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
    case 'regexp':
      return String(v)
    case 'html':
      return v.html
    case 'image':
      return v.target
    case 'error':
      return v.message
    case 'object':
      return JSON.stringify(v instanceof NoteObj ? v.values : v)
    default:
      return String(v)
  }
}
