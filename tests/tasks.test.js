// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { taskToggle } from '../src/renderer/src/tasks.js'
import { createPreview } from '../src/renderer/src/preview.js'
import { listItemLines } from '../src/renderer/src/sourceLines.js'

const flip = (line) => {
  const t = taskToggle(line)
  return t && line.slice(0, t.offset) + t.insert + line.slice(t.offset + 1)
}

describe('ticking a task box (item 5, R3.2)', () => {
  it('ticks an open box and clears a ticked one', () => {
    expect(flip('- [ ] write')).toBe('- [x] write')
    expect(flip('- [x] write')).toBe('- [ ] write')
    expect(flip('- [X] write')).toBe('- [ ] write')
  })
  it('handles every bullet, numbers and nesting', () => {
    expect(flip('* [ ] a')).toBe('* [x] a')
    expect(flip('+ [ ] a')).toBe('+ [x] a')
    expect(flip('12. [ ] a')).toBe('12. [x] a')
    expect(flip('3) [x] a')).toBe('3) [ ] a')
    expect(flip('    - [ ] deep')).toBe('    - [x] deep')
    expect(flip('\t- [ ] tab')).toBe('\t- [x] tab')
  })
  it('leaves a line that is not a task item', () => {
    expect(taskToggle('- plain item')).toBeNull()
    expect(taskToggle('[ ] not a list')).toBeNull()
    expect(taskToggle('- [y] odd')).toBeNull()
    expect(taskToggle('')).toBeNull()
  })
  it('finds each task item by the line its list item is stamped with', () => {
    const text = ['---', 'a: 1', '---', '# Tasks', '', '- [ ] one', '- [x] two', '  - [ ] nested', '', '1. [ ] numbered'].join('\n')
    const preview = createPreview({ assetUrl: () => null, resolves: () => true })
    const { tokens, starts } = preview.toHtml(text, { lines: true })
    const lines = text.split('\n')
    const items = tokens.flatMap((t, i) => (t.type === 'list' ? listItemLines(t, starts[i]) : []))
    const all = (list) => list.flatMap((it) => [it.line, ...it.lists.flatMap(all)])
    const flipped = all(items).map((n) => flip(lines[n - 1]))
    expect(flipped).toEqual(['- [x] one', '- [ ] two', '  - [x] nested', '1. [x] numbered'])
  })
})
