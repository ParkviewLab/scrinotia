// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
//
// Fenced code in the preview and the editor (editor/codeLanguages.js).
import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { codeLanguages, highlightCodeBlocks, languageFor } from '../src/renderer/src/editor/codeLanguages.js'

const block = (lang, text) => {
  const root = document.body.appendChild(document.createElement('div'))
  const pre = root.appendChild(document.createElement('pre'))
  const code = pre.appendChild(document.createElement('code'))
  code.className = `language-${lang}`
  code.textContent = text
  return { root, code }
}

describe('fence languages', () => {
  it('are matched by name and alias', () => {
    expect(languageFor('js').name).toBe('JavaScript')
    expect(languageFor('yaml {title}').name).toBe('YAML')
    expect(languageFor('sh').name).toBe('Shell')
    expect(languageFor('nonsense')).toBe(null)
  })
})

describe('the preview', () => {
  it('colours code in each of the Library’s common languages, keeping its text', async () => {
    for (const [lang, text, token] of [
      ['javascript', 'const a = "x"', 'tok-keyword'],
      ['yaml', 'key: value', 'tok-propertyName'],
      ['css', 'a { color: red }', 'tok-propertyName'],
      ['html', '<p class="x">hi</p>', 'tok-typeName'],
      ['bash', 'echo "hi" # note', 'tok-comment'],
      ['python', 'def f(): return 1', 'tok-keyword'],
      ['json', '{"a": 1}', 'tok-number'],
    ]) {
      const { root, code } = block(lang, text)
      await highlightCodeBlocks(root)
      expect(code.textContent, lang).toBe(text)
      expect(code.querySelector(`.${token}`), lang).not.toBe(null)
    }
  })

  it('leaves an unknown language and a redrawn block alone', async () => {
    const plain = block('nonsense', 'x = 1')
    await highlightCodeBlocks(plain.root)
    expect(plain.code.children.length).toBe(0)

    // A grammar not loaded before, so that it loads after the redraw.
    const gone = block('rust', 'fn main() {}')
    const done = highlightCodeBlocks(gone.root)
    gone.root.innerHTML = '<p>redrawn</p>'
    await done
    expect(gone.code.children.length).toBe(0)
  })
})

describe('the editor', () => {
  it('parses a fence with the language its info string names', async () => {
    const doc = '```js\nconst a = 1\n```\n'
    await languageFor('js').load()
    const state = EditorState.create({ doc, extensions: markdown({ base: markdownLanguage, codeLanguages }) })
    const tree = ensureSyntaxTree(state, doc.length, 1000)
    expect(tree.resolveInner(doc.indexOf('a ='), 1).name).toBe('VariableDefinition')
  })
})
