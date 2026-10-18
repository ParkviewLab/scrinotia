// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Summaries of a view's columns, after the default summary formulas listed
// in docs/references/obsidian-bases-skill/SKILL.md, and custom summaries:
// formulas from the base's top-level `summaries` evaluated with `values`
// bound to the column's values.

import { evaluate } from './evaluate.js'
import { EvalError, ErrorV, DurationV, parseDate, typeOf, valueEquals } from './values.js'

const numbers = (values) => values.filter((v) => typeof v === 'number' && !Number.isNaN(v))
const dates = (values) => values.filter((v) => v !== null && typeof v !== 'number' && typeof v !== 'boolean').map(parseDate).filter(Boolean)
const isEmptyValue = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

function median(ns) {
  const s = [...ns].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Population standard deviation.
function stddev(ns) {
  const mean = ns.reduce((a, b) => a + b, 0) / ns.length
  return Math.sqrt(ns.reduce((a, b) => a + (b - mean) ** 2, 0) / ns.length)
}

export const DEFAULT_SUMMARIES = {
  Average: (vs) => {
    const ns = numbers(vs)
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null
  },
  Min: (vs) => (numbers(vs).length ? Math.min(...numbers(vs)) : null),
  Max: (vs) => (numbers(vs).length ? Math.max(...numbers(vs)) : null),
  Sum: (vs) => numbers(vs).reduce((a, b) => a + b, 0),
  // Range is listed twice in the reference: for numbers, max - min; for
  // dates, latest - earliest. Numbers are used when the column has any.
  Range: (vs) => {
    const ns = numbers(vs)
    if (ns.length) return Math.max(...ns) - Math.min(...ns)
    const ds = dates(vs)
    if (!ds.length) return null
    const ms = ds.map((d) => d.ms)
    return new DurationV(0, Math.max(...ms) - Math.min(...ms))
  },
  Median: (vs) => (numbers(vs).length ? median(numbers(vs)) : null),
  Stddev: (vs) => (numbers(vs).length ? stddev(numbers(vs)) : null),
  Earliest: (vs) => {
    const ds = dates(vs)
    return ds.length ? ds.reduce((a, b) => (b.ms < a.ms ? b : a)) : null
  },
  Latest: (vs) => {
    const ds = dates(vs)
    return ds.length ? ds.reduce((a, b) => (b.ms > a.ms ? b : a)) : null
  },
  Checked: (vs) => vs.filter((v) => v === true).length,
  Unchecked: (vs) => vs.filter((v) => v === false).length,
  Empty: (vs) => vs.filter(isEmptyValue).length,
  Filled: (vs) => vs.filter((v) => !isEmptyValue(v)).length,
  Unique: (vs) => vs.filter((v, i) => !isEmptyValue(v) && vs.findIndex((w) => valueEquals(v, w)) === i).length,
}

// name: a default summary or a key of the base's `summaries`; values: the
// column's values for the rows summarised; customs: name -> syntax tree.
export function summarise(name, values, { ctx, customs = {}, row }) {
  try {
    if (customs[name] instanceof Error) return new ErrorV(customs[name].message)
    if (customs[name]) return evaluate(customs[name], ctx, row, { values: values.filter((v) => typeOf(v) !== 'error') })
    const fn = DEFAULT_SUMMARIES[name]
    if (!fn) return new ErrorV(`no summary named ${name}`)
    return fn(values.filter((v) => typeOf(v) !== 'error'))
  } catch (err) {
    if (err instanceof EvalError) return new ErrorV(err.message)
    throw err
  }
}
