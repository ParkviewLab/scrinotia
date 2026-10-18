// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The .base expression language (filters and formulas share it), parsed into
// a syntax tree. Implemented from the references in docs/references/.
//
// Precedence, lowest first: || ; && ; == != ; < <= > >= ; + - ; * / % ;
// unary ! - ; postfix .member, .method(...), [index], call(...).
// A "/" starts a regular-expression literal only where an operand is expected.
// Identifiers are letters, digits and "_"; a property whose name holds other
// characters is written note["my property"] (R3.6).

export class Unsupported extends Error {}

const PUNCT = ['==', '!=', '>=', '<=', '&&', '||', '(', ')', '[', ']', ',', '.', '!', '<', '>', '+', '-', '*', '/', '%']

export function tokenize(src) {
  const tokens = []
  let i = 0
  const operandExpected = () => {
    const prev = tokens[tokens.length - 1]
    if (!prev) return true
    if (prev.t === 'num' || prev.t === 'str' || prev.t === 'id' || prev.t === 're') return false
    return !(prev.v === ')' || prev.v === ']')
  }
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? '') && operandExpected())) {
      const m = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      tokens.push({ t: 'num', v: Number(m[0]), at: i })
      i += m[0].length
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let out = ''
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1]
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n
          j += 2
        } else out += src[j++]
      }
      if (j >= src.length) throw new Unsupported(`unterminated string in “${src}”`)
      tokens.push({ t: 'str', v: out, at: i })
      i = j + 1
      continue
    }
    if (c === '/' && operandExpected()) {
      let j = i + 1
      let inClass = false
      while (j < src.length) {
        if (src[j] === '\\') j += 2
        else if (src[j] === '[') (inClass = true), j++
        else if (src[j] === ']') (inClass = false), j++
        else if (src[j] === '/' && !inClass) break
        else j++
      }
      if (j >= src.length) throw new Unsupported(`unterminated regular expression in “${src}”`)
      const body = src.slice(i + 1, j)
      const flags = /^[a-z]*/.exec(src.slice(j + 1))[0]
      try {
        tokens.push({ t: 're', v: new RegExp(body, flags), at: i })
      } catch (err) {
        throw new Unsupported(`bad regular expression /${body}/: ${err.message}`)
      }
      i = j + 1 + flags.length
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))
      tokens.push({ t: 'id', v: m[0], at: i })
      i += m[0].length
      continue
    }
    const p = PUNCT.find((op) => src.startsWith(op, i))
    if (!p) throw new Unsupported(`cannot read “${src.slice(i)}” in “${src}”`)
    tokens.push({ t: 'op', v: p, at: i })
    i += p.length
  }
  return tokens
}

// Node shapes:
//   { k: 'lit', v }  { k: 're', v }  { k: 'id', name }  { k: 'list', items }
//   { k: 'member', obj, name }  { k: 'index', obj, key }
//   { k: 'call', callee: name, args }  { k: 'method', obj, name, args }
//   { k: 'unary', op, arg }  { k: 'bin', op, l, r }
export function parse(src) {
  const text = String(src)
  const tokens = tokenize(text)
  let i = 0
  const peek = () => tokens[i]
  const isOp = (v) => tokens[i]?.t === 'op' && tokens[i].v === v
  const expect = (v) => {
    if (!isOp(v)) throw new Unsupported(`expected “${v}” in “${text}”`)
    i++
  }
  const binary = (next, ops) => () => {
    let l = next()
    while (tokens[i]?.t === 'op' && ops.includes(tokens[i].v)) {
      const op = tokens[i++].v
      l = { k: 'bin', op, l, r: next() }
    }
    return l
  }
  function args() {
    const out = []
    expect('(')
    if (!isOp(')')) {
      out.push(or())
      while (isOp(',')) {
        i++
        out.push(or())
      }
    }
    expect(')')
    return out
  }
  function primary() {
    const tok = tokens[i++]
    if (!tok) throw new Unsupported(`incomplete expression “${text}”`)
    if (tok.t === 'num' || tok.t === 'str') return { k: 'lit', v: tok.v }
    if (tok.t === 're') return { k: 're', v: tok.v }
    if (tok.t === 'op' && tok.v === '(') {
      const e = or()
      expect(')')
      return e
    }
    if (tok.t === 'op' && tok.v === '[') {
      const items = []
      if (!isOp(']')) {
        items.push(or())
        while (isOp(',')) {
          i++
          items.push(or())
        }
      }
      expect(']')
      return { k: 'list', items }
    }
    if (tok.t === 'id') {
      if (tok.v === 'true') return { k: 'lit', v: true }
      if (tok.v === 'false') return { k: 'lit', v: false }
      if (tok.v === 'null') return { k: 'lit', v: null }
      if (isOp('(')) return { k: 'call', callee: tok.v, args: args() }
      return { k: 'id', name: tok.v }
    }
    throw new Unsupported(`unexpected “${tok.v}” in “${text}”`)
  }
  function postfix() {
    let e = primary()
    for (;;) {
      if (isOp('.')) {
        i++
        const name = peek()
        if (!name || name.t !== 'id') throw new Unsupported(`expected a name after “.” in “${text}”`)
        i++
        e = isOp('(') ? { k: 'method', obj: e, name: name.v, args: args() } : { k: 'member', obj: e, name: name.v }
      } else if (isOp('[')) {
        i++
        const key = or()
        expect(']')
        e = { k: 'index', obj: e, key }
      } else return e
    }
  }
  function unary() {
    if (isOp('!') || isOp('-')) {
      const op = tokens[i++].v
      return { k: 'unary', op, arg: unary() }
    }
    return postfix()
  }
  const mul = binary(unary, ['*', '/', '%'])
  const add = binary(mul, ['+', '-'])
  const rel = binary(add, ['<', '<=', '>', '>='])
  const eq = binary(rel, ['==', '!='])
  const and = binary(eq, ['&&'])
  const or = binary(and, ['||'])
  const tree = or()
  if (i < tokens.length) throw new Unsupported(`unexpected “${tokens[i].v}” in “${text}”`)
  return tree
}

// A property id as used by order, sort, groupBy and properties: note.x,
// file.x, formula.x, or a bare frontmatter name. Never tokenised, so a name
// with spaces or hyphens works here as written.
export function parsePropertyId(id) {
  const s = String(id)
  const m = /^(note|file|formula)\.(.+)$/.exec(s)
  if (m) return { type: m[1], name: m[2] }
  return { type: 'note', name: s }
}
