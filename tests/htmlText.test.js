// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { htmlText } from '../src/main/htmlText.js'

describe('htmlText', () => {
  it('keeps the title and visible text, one line per block, without scripts or styles', () => {
    const html = `<!doctype html><html><head><title>The Guide</title><style>p{color:red}</style>
      <script>var secret = "hidden"</script></head><body>
      <h1>Visual &amp; style</h1><p>First   paragraph
      with <b>bold</b> text.</p><ul><li>One</li><li>Two</li></ul>
      <script>document.write('not seen')</script><noscript>No script</noscript></body></html>`
    expect(htmlText(html)).toBe('The Guide\nVisual & style\nFirst paragraph with bold text.\nOne\nTwo')
  })
  it('handles fragments and empty input', () => {
    expect(htmlText('just <i>text</i>')).toBe('just text')
    expect(htmlText('')).toBe('')
  })
})
