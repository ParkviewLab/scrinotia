// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { VaultMarkdown } from '../src/shared/markdown.js'
import { linkAt } from '../src/renderer/src/editor/links.js'

const at = (doc, inside) => {
  const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage, extensions: [VaultMarkdown] }) })
  return linkAt(state, doc.indexOf(inside) + 1)
}

describe('the link at a position', () => {
  it('reads a wikilink or embed body, as the preview does', () => {
    expect(at('See [[Plan#Goals|the goals]] now', 'Goals')).toMatchObject({ kind: 'wikilink', ref: 'Plan#Goals|the goals' })
    expect(at('![[diagram.png]]', 'diagram')).toMatchObject({ kind: 'wikilink', ref: 'diagram.png' })
    expect(at('[[Plan]]', '[[')).toMatchObject({ kind: 'wikilink', ref: 'Plan' })
  })

  it('reads the URL of a Markdown link, an autolink or a bare URL', () => {
    expect(at('A [note](Other%20note.md) here', 'note]')).toMatchObject({ kind: 'href', ref: 'Other%20note.md' })
    expect(at('<https://example.com/a>', 'example')).toMatchObject({ kind: 'href', ref: 'https://example.com/a' })
    expect(at('see https://example.com/b too', 'example')).toMatchObject({ kind: 'href', ref: 'https://example.com/b' })
  })

  it('finds nothing in plain text or code', () => {
    expect(at('plain words', 'words')).toBe(null)
    expect(at('`[[NotALink]]`', 'NotA')).toBe(null)
  })
})
