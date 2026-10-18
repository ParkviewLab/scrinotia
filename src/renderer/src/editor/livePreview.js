// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Live preview (R3.1): decorations over the raw text, never a re-rendering of
// it. Formatting marks are hidden except on the lines the selection touches,
// where the source shows; the document itself is never changed by this
// plugin, so a note's bytes are exactly what the user typed (R1.3).

import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { Facet } from '@codemirror/state'

// A function (target) => boolean telling whether a wikilink target resolves.
export const linkResolves = Facet.define({ combine: (v) => v[0] ?? (() => true) })

const hide = Decoration.replace({})

class CheckboxWidget extends WidgetType {
  constructor(checked, pos) {
    super()
    this.checked = checked
    this.pos = pos
  }
  eq(other) {
    return other.checked === this.checked && other.pos === this.pos
  }
  toDOM(view) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const insert = this.checked ? '[ ]' : '[x]'
      view.dispatch({ changes: { from: this.pos, to: this.pos + 3, insert }, userEvent: 'input.toggle' })
    })
    return box
  }
  ignoreEvent() {
    return false
  }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('span')
    hr.className = 'cm-rule'
    return hr
  }
}

// The range of a leading YAML frontmatter block, or null.
export function frontmatterRange(doc) {
  if (doc.lines < 2 || doc.line(1).text !== '---') return null
  for (let n = 2; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (text === '---' || text === '...') return { from: 0, to: doc.line(n).to, lastLine: n }
  }
  return null
}

function activeLines(state) {
  const lines = new Set()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number
    const b = state.doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) lines.add(n)
  }
  return lines
}

function build(view, reveal) {
  const { state } = view
  const doc = state.doc
  const active = reveal ? activeLines(state) : new Set()
  const touches = (from, to) => {
    const a = doc.lineAt(from).number
    const b = doc.lineAt(to).number
    for (let n = a; n <= b; n++) if (active.has(n)) return true
    return false
  }
  const resolves = state.facet(linkResolves)
  const decos = []
  const lineClass = (from, cls) => decos.push(Decoration.line({ class: cls }).range(doc.lineAt(from).from))
  const fm = frontmatterRange(doc)

  if (fm) for (let n = 1; n <= fm.lastLine; n++) lineClass(doc.line(n).from, 'cm-frontmatter')

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (fm && node.from <= fm.to) return node.to > fm.to ? undefined : false
        const name = node.name
        const shown = touches(node.from, node.to)

        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          lineClass(node.from, `cm-h${heading[1]}`)
          if (!shown) {
            const mark = node.node.getChild('HeaderMark')
            if (mark) {
              const end = doc.sliceString(mark.to, mark.to + 1) === ' ' ? mark.to + 1 : mark.to
              decos.push(hide.range(mark.from, end))
            }
          }
          return undefined
        }

        switch (name) {
          case 'Emphasis':
          case 'StrongEmphasis':
          case 'Strikethrough':
          case 'Highlight': {
            const cls = { Emphasis: 'cm-em', StrongEmphasis: 'cm-strong', Strikethrough: 'cm-strike', Highlight: 'cm-highlight' }[name]
            decos.push(Decoration.mark({ class: cls }).range(node.from, node.to))
            if (!shown) {
              const markName = { Emphasis: 'EmphasisMark', StrongEmphasis: 'EmphasisMark', Strikethrough: 'StrikethroughMark', Highlight: 'HighlightMark' }[name]
              for (const m of node.node.getChildren(markName)) decos.push(hide.range(m.from, m.to))
            }
            return undefined
          }
          case 'InlineCode': {
            decos.push(Decoration.mark({ class: 'cm-inline-code' }).range(node.from, node.to))
            if (!shown) for (const m of node.node.getChildren('CodeMark')) decos.push(hide.range(m.from, m.to))
            return false
          }
          case 'FencedCode':
          case 'CodeBlock': {
            for (let n = doc.lineAt(node.from).number; n <= doc.lineAt(node.to).number; n++) {
              lineClass(doc.line(n).from, 'cm-codeblock')
            }
            return false
          }
          case 'Comment': {
            decos.push(Decoration.mark({ class: 'cm-comment' }).range(node.from, node.to))
            return false
          }
          case 'Blockquote': {
            const first = doc.lineAt(node.from).text
            const callout = /^\s*>\s*\[!/.test(first)
            for (let n = doc.lineAt(node.from).number; n <= doc.lineAt(node.to).number; n++) {
              lineClass(doc.line(n).from, callout ? 'cm-quote cm-callout' : 'cm-quote')
            }
            return undefined
          }
          case 'HorizontalRule': {
            if (!shown) decos.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to))
            return false
          }
          case 'TaskMarker': {
            if (!shown) {
              const checked = /x/i.test(doc.sliceString(node.from, node.to))
              decos.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to))
            }
            return false
          }
          case 'Link': {
            const marks = node.node.getChildren('LinkMark')
            const url = node.node.getChild('URL')
            if (marks.length >= 2 && url) {
              const href = doc.sliceString(url.from, url.to)
              decos.push(
                Decoration.mark({ class: 'cm-link', attributes: { 'data-href': href } }).range(marks[0].to, marks[1].from),
              )
              if (!shown) {
                decos.push(hide.range(marks[0].from, marks[0].to))
                decos.push(hide.range(marks[1].from, node.to))
              }
            }
            return false
          }
          case 'Wikilink':
          case 'Embed': {
            const target = node.node.getChild('WikilinkTarget')
            const alias = node.node.getChild('WikilinkAlias')
            const ref = target ? doc.sliceString(target.from, target.to) : ''
            const ok = resolves(ref)
            const cls = `${name === 'Embed' ? 'cm-embed' : 'cm-wikilink'}${ok ? '' : ' cm-unresolved'}`
            const visible = alias ?? target
            if (visible) {
              decos.push(Decoration.mark({ class: cls, attributes: { 'data-wikilink': ref } }).range(visible.from, visible.to))
            }
            if (!shown) {
              for (const m of node.node.getChildren('WikilinkMark')) decos.push(hide.range(m.from, m.to))
              if (alias && target) decos.push(hide.range(target.from, target.to))
            }
            return false
          }
          default:
            return undefined
        }
      },
    })
  }
  return Decoration.set(decos, true)
}

// reveal=false is the reading mode: nothing is revealed under the cursor.
export function livePreview({ reveal = true } = {}) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view, reveal)
      }
      update(u) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = build(u.view, reveal)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

// Clicking a rendered link follows it (wikilinks to notes; Markdown links to
// local notes or, for URLs, the system browser via onFollow).
export function linkClicks(onFollow) {
  return EditorView.domEventHandlers({
    mousedown(e) {
      if (e.button !== 0) return false
      const el = e.target.closest?.('[data-wikilink], [data-href]')
      if (!el) return false
      const wikilink = el.getAttribute('data-wikilink')
      e.preventDefault()
      if (wikilink !== null) onFollow({ kind: 'wikilink', ref: wikilink })
      else onFollow({ kind: 'href', ref: el.getAttribute('data-href') })
      return true
    },
  })
}
