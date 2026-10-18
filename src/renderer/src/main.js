// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault browser and editor: a start screen with recent vaults, then a
// file tree and the note editor.

import { createEditor } from './editor/editor.js'
import { createPreview } from './preview.js'
import { renderCell } from './baseCells.js'
import { renderAttachment, attachmentKind } from './attachments.js'
import { extractSection, listHeadings } from '../../shared/sections.js'
import { fuzzyRank } from './fuzzy.js'
import { setModelColour, mountPreviewModel, normaliseColour, colourCss, DEFAULT_MODEL_COLOUR } from './modelViewer.js'
import 'katex/dist/katex.min.css'
import DOMPurify from 'dompurify'
import { splitLink } from '../../shared/markdown.js'
import { resolveLink, resolveRelative, flattenFiles } from '../../shared/links.js'
import nameCardUrl from '../../../brand/scrinotia-icon-kit/brand/scrinotia-name-card.png'

const api = window.scrinotia
document.getElementById('panel-card').src = nameCardUrl
const $ = (id) => document.getElementById(id)

const view = {
  tree: [],
  selected: null, // { path, type }
  openNote: null, // path of the note shown in the pane
  expanded: new Set(),
  renaming: false, // an inline rename input is open; do not redraw the tree under it
}

// ---- theme (R6.2): dark by default; kept per vault in .scrinotia/ (R6.4) ----
const themeSelect = $('theme')
// The vault's appearance.json as last read or written; each change writes the
// whole object, so changing one setting keeps the others.
let appearance = {}
async function saveAppearance(changes) {
  appearance = { ...appearance, ...changes }
  try {
    await api.setSettings('appearance', appearance)
  } catch (err) {
    showError($('pane-error'), err)
  }
}
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark'
  const changed = document.documentElement.dataset.theme !== t
  document.documentElement.dataset.theme = t
  themeSelect.value = t
  // Diagrams are drawn in the theme's colours, so a change redraws them.
  if (changed && typeof current !== 'undefined' && current) renderPreview()
}
themeSelect.addEventListener('change', () => {
  applyTheme(themeSelect.value)
  saveAppearance({ theme: themeSelect.value })
})

async function loadVaultSettings() {
  try {
    const { values, conflicts } = await api.getSettings('appearance')
    appearance = values
    applyTheme(values.theme)
    setModelColour(values.modelColour)
    applyFonts(values.fonts)
    if (conflicts.length) {
      showError($('pane-error'), `Ignored a synchronisation conflict copy of the vault settings: ${conflicts.join(', ')}`)
    }
  } catch {
    appearance = {}
    applyTheme('dark')
    setModelColour(null)
    applyFonts(null)
  }
}

// ---- settings (R6.8): Cmd/Ctrl+, opens the dialog for this window's vault ----
const SLIDERS = ['h', 's', 'l']
let settingsColour = null
function openSettings() {
  if ($('workspace').hidden || !$('settings').hidden) return
  settingsColour = normaliseColour(appearance.modelColour)
  drawSettings()
  drawFontChoices()
  $('settings').hidden = false
  mountPreviewModel($('settings-preview'))
  $('settings-h').focus()
}
function closeSettings() {
  $('settings').hidden = true
  // Removing the canvas releases the preview's WebGL context.
  $('settings-preview').replaceChildren()
}
function drawSettings() {
  for (const k of SLIDERS) {
    $(`settings-${k}`).value = settingsColour[k]
    $(`settings-${k}-value`).textContent = k === 'h' ? `${settingsColour.h}°` : `${settingsColour[k]}%`
  }
  $('settings-swatch').style.background = colourCss(settingsColour)
}
for (const k of SLIDERS) {
  $(`settings-${k}`).addEventListener('input', (e) => {
    settingsColour = { ...settingsColour, [k]: Number(e.target.value) }
    drawSettings()
    setModelColour(settingsColour)
  })
  // Saved when a drag ends, not on every step of it.
  $(`settings-${k}`).addEventListener('change', () => saveAppearance({ modelColour: settingsColour }))
}
$('settings-reset').addEventListener('click', () => {
  settingsColour = { ...DEFAULT_MODEL_COLOUR }
  drawSettings()
  setModelColour(settingsColour)
  saveAppearance({ modelColour: settingsColour })
})
$('settings-done').addEventListener('click', closeSettings)
$('settings').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeSettings()
  }
})
$('settings').addEventListener('mousedown', (e) => {
  if (e.target === $('settings')) closeSettings()
})

// ---- fonts (R6.9): four CSS variables, each a chosen family before its default stack ----
const FONT_ROLES = ['ui', 'body', 'heading', 'mono']
function fontsOf(stored) {
  const out = {}
  for (const role of FONT_ROLES) {
    const f = stored && typeof stored[role] === 'string' ? stored[role].replace(/[\n\r]/g, '').trim() : ''
    if (f) out[role] = f
  }
  return out
}
const cssFamily = (family) => `"${family.replace(/["\\]/g, '\\$&')}"`
function applyFonts(stored) {
  const fonts = fontsOf(stored)
  for (const role of FONT_ROLES) {
    const style = document.documentElement.style
    if (fonts[role]) style.setProperty(`--font-${role}`, `${cssFamily(fonts[role])}, var(--font-${role}-default)`)
    else style.removeProperty(`--font-${role}`)
  }
}
// The installed families, read once, when the dialog first needs them.
let installedFamilies = null
async function fontFamilies() {
  installedFamilies ??= (async () => {
    try {
      const fonts = await window.queryLocalFonts()
      return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  })()
  return installedFamilies
}
// Drawn at once with the stored choices, then again when the list of
// installed fonts arrives (reading it can take a second the first time).
async function drawFontChoices() {
  fillFontChoices([])
  fillFontChoices(await fontFamilies())
}
function fillFontChoices(families) {
  const fonts = fontsOf(appearance.fonts)
  for (const role of FONT_ROLES) {
    const select = $(`settings-font-${role}`)
    // A stored family missing here is still listed, so the choice is visible.
    const names = fonts[role] && !families.includes(fonts[role]) ? [fonts[role], ...families] : families
    const options = [new Option(role === 'heading' ? 'Default (the body font)' : 'Default', '')]
    for (const name of names) options.push(new Option(name, name))
    select.replaceChildren(...options)
    select.value = fonts[role] ?? ''
    drawFontSample(role)
  }
}
function drawFontSample(role) {
  const sample = $(`settings-font-${role}-sample`)
  sample.style.fontFamily = `var(--font-${role})`
}
for (const role of FONT_ROLES) {
  $(`settings-font-${role}`).addEventListener('change', (e) => {
    const fonts = fontsOf(appearance.fonts)
    if (e.target.value) fonts[role] = e.target.value
    else delete fonts[role]
    applyFonts(fonts)
    saveAppearance({ fonts })
  })
}

api.onSettings(openSettings)
// The menu's accelerator normally opens it; this covers a focus the menu misses.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === ',') {
    e.preventDefault()
    openSettings()
  }
})

// ---- helpers ----
function parentOf(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
function join(folder, name) {
  return folder ? `${folder}/${name}` : name
}
function findEntry(entries, path) {
  for (const e of entries) {
    if (e.path === path) return e
    if (e.children) {
      const hit = findEntry(e.children, path)
      if (hit) return hit
    }
  }
  return null
}
function showError(el, err) {
  el.textContent = err ? String(err.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : ''
}
// The folder new entries go into: the selected folder, or the selected file's folder.
function targetFolder() {
  if (!view.selected) return ''
  return view.selected.type === 'folder' ? view.selected.path : parentOf(view.selected.path)
}

// ---- start screen ----
async function renderRecent() {
  const list = $('recent')
  list.replaceChildren()
  const recent = await api.recentVaults()
  if (recent.length === 0) {
    const li = document.createElement('li')
    li.className = 'muted'
    li.textContent = 'None yet.'
    list.append(li)
  }
  for (const dir of recent) {
    const li = document.createElement('li')
    const path = document.createElement('span')
    path.className = 'path'
    path.textContent = dir
    path.title = dir
    path.addEventListener('click', () => enterVault(() => api.openVault(dir)))
    const forget = document.createElement('button')
    forget.type = 'button'
    forget.textContent = 'Forget'
    forget.addEventListener('click', async () => {
      await api.forgetVault(dir)
      renderRecent()
    })
    li.append(path, forget)
    list.append(li)
  }
}

async function enterVault(opener) {
  showError($('start-error'), null)
  try {
    const opened = await opener()
    if (!opened) return
    if (opened.elsewhere) {
      $('start-error').textContent = `${opened.name} is already open in another window.`
      return
    }
    view.tree = opened.tree
    view.selected = null
    view.openNote = null
    tabs.list = []
    tabs.active = -1
    renderTabs()
    view.expanded = new Set()
    notes.clear()
    current = null
    $('search').value = ''
    runSearch()
    assetBase = opened.assetBase ?? ''
    $('vault-name').textContent = opened.name
    $('vault-name').title = opened.root
    $('start').hidden = true
    $('workspace').hidden = false
    await restoreTabs()
    renderTree()
    await renderPane()
    await loadVaultSettings()
  } catch (err) {
    showError($('start-error'), err)
  }
}

$('open-folder').addEventListener('click', () => enterVault(api.chooseVault))
$('new-window').addEventListener('click', () => api.newWindow())
$('about-link').addEventListener('click', (e) => {
  e.preventDefault()
  api.openAbout()
})
$('licenses-link').addEventListener('click', (e) => {
  e.preventDefault()
  api.openLicenses()
})
$('switch-vault').addEventListener('click', () => {
  $('workspace').hidden = true
  $('start').hidden = false
  renderRecent()
})

// ---- tree ----
function renderTree() {
  $('tree').replaceChildren(...view.tree.map(renderEntry))
}

function renderEntry(entry) {
  const li = document.createElement('li')
  li.className = entry.type
  li.setAttribute('role', 'treeitem')
  li.dataset.path = entry.path
  const row = document.createElement('span')
  row.className = 'row'
  row.textContent = entry.type === 'note' ? entry.name.replace(/\.md$/i, '') : entry.name
  row.title = entry.path
  if (view.selected?.path === entry.path) row.classList.add('selected')
  row.draggable = true
  row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-scrinotia-path', entry.path))
  row.addEventListener('click', (e) => select(entry, { newTab: e.metaKey || e.ctrlKey }))
  row.addEventListener('auxclick', (e) => {
    if (e.button === 1 && entry.type !== 'folder') select(entry, { newTab: true })
  })
  row.addEventListener('contextmenu', async (e) => {
    e.preventDefault()
    const isFolder = entry.type === 'folder'
    const choice = await api.menu([
      ...(isFolder ? [] : [{ id: 'open', label: 'Open' }, { id: 'tab', label: 'Open in new tab' }, { type: 'separator' }]),
      { id: 'rename', label: 'Rename' },
      { id: 'trash', label: 'Move to trash' },
    ])
    if (choice === 'open') select(entry)
    if (choice === 'tab') select(entry, { newTab: true })
    if (choice === 'rename' || choice === 'trash') {
      view.selected = { path: entry.path, type: entry.type }
      renderTree()
      renderPane()
      if (choice === 'rename') startRename()
      else $('delete').click()
    }
  })
  li.append(row)
  if (entry.type === 'folder') {
    if (view.expanded.has(entry.path)) li.classList.add('open')
    row.addEventListener('dragover', (e) => e.preventDefault())
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      moveInto(e.dataTransfer.getData('text/x-scrinotia-path'), entry.path)
    })
    const ul = document.createElement('ul')
    ul.setAttribute('role', 'group')
    ul.append(...entry.children.map(renderEntry))
    li.append(ul)
  }
  return li
}

// Dropping on the empty part of the tree moves to the vault root.
$('tree').addEventListener('dragover', (e) => e.preventDefault())
$('tree').addEventListener('drop', (e) => {
  e.preventDefault()
  moveInto(e.dataTransfer.getData('text/x-scrinotia-path'), '')
})

async function moveInto(from, folder) {
  if (!from || parentOf(from) === folder) return
  if (folder === from || folder.startsWith(from + '/')) return
  const name = from.slice(from.lastIndexOf('/') + 1)
  await rename(from, join(folder, name))
}

function select(entry, { newTab = false } = {}) {
  view.selected = { path: entry.path, type: entry.type }
  if (entry.type === 'folder') {
    if (view.expanded.has(entry.path)) view.expanded.delete(entry.path)
    else view.expanded.add(entry.path)
  } else {
    showInTab(entry.path, { newTab })
  }
  renderTree()
  renderPane()
}

// ---- tabs (R2.5): one tab per open file. A click opens a file in the
// current tab; Cmd/Ctrl+click or a middle click opens it in a new one; a
// file already open in a tab is brought forward instead of opened twice. ----
const tabs = { list: [], active: -1 }

function showInTab(path, { newTab = false } = {}) {
  const at = tabs.list.indexOf(path)
  if (at >= 0) tabs.active = at
  else if (newTab || tabs.active < 0) {
    tabs.list.splice(tabs.active + 1, 0, path)
    tabs.active += 1
  } else tabs.list[tabs.active] = path
  view.openNote = path
  renderTabs()
}

function activateTab(i) {
  if (i < 0 || i >= tabs.list.length) return
  tabs.active = i
  view.openNote = tabs.list[i]
  view.selected = { path: view.openNote, type: findEntry(view.tree, view.openNote)?.type ?? 'note' }
  renderTabs()
  renderTree()
  renderPane()
}

function closeTab(i) {
  if (i < 0 || i >= tabs.list.length) return
  tabs.list.splice(i, 1)
  if (tabs.active >= tabs.list.length || i < tabs.active) tabs.active -= 1
  if (tabs.active < 0 && tabs.list.length) tabs.active = 0
  view.openNote = tabs.list[tabs.active] ?? null
  view.selected = view.openNote ? { path: view.openNote, type: findEntry(view.tree, view.openNote)?.type ?? 'note' } : null
  renderTabs()
  renderTree()
  renderPane()
}

// After files move or vanish: remap or drop their tabs.
function retab(map) {
  const before = tabs.list[tabs.active]
  tabs.list = tabs.list.map(map).filter(Boolean)
  tabs.list = tabs.list.filter((p, i) => tabs.list.indexOf(p) === i)
  const now = before ? map(before) : null
  tabs.active = now ? tabs.list.indexOf(now) : Math.min(tabs.active, tabs.list.length - 1)
  if (tabs.active < 0 && tabs.list.length) tabs.active = 0
  view.openNote = tabs.list[tabs.active] ?? null
  renderTabs()
}

// Tabs are remembered per vault on this machine (R2.5, R6.5) and restored
// when the vault opens, leaving out files that no longer exist.
let saveTabsTimer = null
let restoringTabs = false
function saveTabs() {
  if (restoringTabs || $('workspace').hidden) return
  clearTimeout(saveTabsTimer)
  saveTabsTimer = setTimeout(() => api.setTabs({ list: tabs.list, active: tabs.active }).catch(() => {}), 300)
}
async function restoreTabs() {
  restoringTabs = true
  try {
    const saved = await api.getTabs()
    const list = saved.list.filter((p) => findEntry(view.tree, p))
    const activePath = saved.list[saved.active]
    tabs.list = list
    tabs.active = list.length ? Math.max(0, list.indexOf(activePath)) : -1
    view.openNote = tabs.list[tabs.active] ?? null
    if (view.openNote) {
      view.selected = { path: view.openNote, type: findEntry(view.tree, view.openNote)?.type ?? 'note' }
      let folder = parentOf(view.openNote)
      while (folder) {
        view.expanded.add(folder)
        folder = parentOf(folder)
      }
    }
  } catch {
    tabs.list = []
    tabs.active = -1
  } finally {
    restoringTabs = false
  }
  renderTabs()
}

function renderTabs() {
  saveTabs()
  const nav = $('tabs')
  nav.hidden = tabs.list.length === 0
  nav.replaceChildren(
    ...tabs.list.map((p, i) => {
      const tab = document.createElement('div')
      tab.className = `tab${i === tabs.active ? ' active' : ''}`
      tab.setAttribute('role', 'tab')
      tab.title = p
      const label = document.createElement('span')
      label.className = 'tab-label'
      label.textContent = p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '')
      const x = document.createElement('button')
      x.type = 'button'
      x.className = 'tab-close'
      x.textContent = '×'
      x.title = 'Close tab'
      x.addEventListener('click', (e) => {
        e.stopPropagation()
        closeTab(i)
      })
      tab.append(label, x)
      tab.addEventListener('click', () => activateTab(i))
      tab.addEventListener('auxclick', (e) => {
        if (e.button === 1) closeTab(i)
      })
      tab.addEventListener('contextmenu', async (e) => {
        e.preventDefault()
        const choice = await api.menu([
          { id: 'close', label: 'Close tab' },
          { id: 'others', label: 'Close other tabs', enabled: tabs.list.length > 1 },
        ])
        if (choice === 'close') closeTab(i)
        if (choice === 'others') {
          const keep = tabs.list[i]
          tabs.list = [keep]
          tabs.active = 0
          view.openNote = keep
          renderTabs()
          renderPane()
        }
      })
      return tab
    }),
  )
}

api.onCloseTab(() => {
  if (tabs.list.length) closeTab(tabs.active)
})
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Tab' && tabs.list.length > 1) {
    e.preventDefault()
    const n = tabs.list.length
    activateTab((tabs.active + (e.shiftKey ? n - 1 : 1)) % n)
  }
})

async function refreshTree() {
  view.tree = await api.tree()
  if (view.renaming) return
  if (view.selected && !findEntry(view.tree, view.selected.path)) view.selected = null
  if (tabs.list.some((p) => !findEntry(view.tree, p))) retab((p) => (findEntry(view.tree, p) ? p : null))
  renderTree()
}

// ---- pane and editor ----
// One entry per note opened this session: its editor state (with undo
// history), the text last read from or written to disk, and whether it has
// unsaved edits. Saving happens only after user edits (R1.1), half a second
// after typing stops (R3.4); a watcher event whose disk text equals the last
// text written is the echo of our own save and is ignored.
const notes = new Map()
let current = null
let conflictText = null
const SAVE_DELAY = 500

const editor = createEditor($('editor'), {
  onUserChange: () => {
    const entry = notes.get(current)
    if (!entry) return
    entry.dirty = true
    clearTimeout(entry.timer)
    const path = current
    entry.timer = setTimeout(() => save(path), SAVE_DELAY)
    schedulePreview()
  },
  onScroll: syncScroll,
})

// ---- preview (R3.1): read-only rendering, alone or beside the editor ----
let assetBase = ''
let noteMode = 'preview'
let previewTimer = null
const preview = createPreview({
  assetUrl: (target) => {
    const hit = resolveLink(target, current, files())
    return hit ? assetBase + hit.split('/').map(encodeURIComponent).join('/') : null
  },
  resolves: (target) => resolveLink(target, current, files()) !== null,
  resolvePath: (target) => resolveLink(target, current, files()),
  attachmentKind,
})

// A base's preview is its views, computed from the saved file, so it is
// redrawn after each save rather than on each keystroke.
function renderPreview() {
  clearTimeout(previewTimer)
  if (!current) return
  if (notes.get(current)?.kind === 'base') {
    showBase(current)
    return
  }
  preview.render(editor.text(), $('preview'))
  // The note's Properties stay as the reader left them while the note is
  // open; the split view redraws the preview on each edit.
  if (propertiesOpen !== current) propertiesOpen = null
  if (propertiesOpen) $('preview').querySelector(':scope > details.properties')?.setAttribute('open', '')
  fillEmbeds()
  renderOutline()
}
// The note whose Properties drawer the reader has opened, while that note
// stays open; opening any note, that one included, starts it closed.
let propertiesOpen = null
$('preview').addEventListener(
  'toggle',
  (e) => {
    if (!e.target.matches?.('details.properties') || e.target.parentElement !== $('preview')) return
    propertiesOpen = e.target.open ? current : null
  },
  true,
)

// ---- outline (R4.6): the note's headings; a click goes to the heading in
// the preview and, in split mode, puts the editor's cursor on its line ----
function renderOutline() {
  const list = $('outline')
  if (!current || notes.get(current)?.kind === 'base') {
    list.replaceChildren()
    return
  }
  const heads = listHeadings(editor.text())
  const top = Math.min(...heads.map((h) => h.level))
  list.replaceChildren(
    ...heads.map((h, k) => {
      const li = document.createElement('li')
      li.textContent = h.text
      li.style.paddingLeft = `${12 + (h.level - top) * 14}px`
      li.title = h.text
      li.addEventListener('click', () => goToHeading(k, h.line))
      return li
    }),
  )
}

function goToHeading(k, line) {
  // The preview's own headings, in order, leaving out embedded notes and the properties block.
  const els = [...$('preview').querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((el) => !el.closest('.note-embed, .properties, .callout'))
  els[k]?.scrollIntoView({ block: 'start' })
  if (noteMode === 'split') editor.gotoLine(line)
}

async function fillEmbeds() {
  const note = current
  await fillNoteEmbeds($('preview'), 1, new Set([note]))
  if (current !== note) return
  fillBaseEmbeds()
  fillAttachmentEmbeds()
  fillMermaid($('preview'))
}

// Mermaid diagrams (R3.8): loaded only when a note has one; drawn with the
// strict security level, in the theme's colours; an invalid diagram shows
// its error in place of the drawing.
let mermaidLib = null
let mermaidSeq = 0
async function fillMermaid(host) {
  const blocks = [...host.querySelectorAll('pre.mermaid-src')]
  if (!blocks.length) return
  if (!mermaidLib) mermaidLib = (await import('mermaid')).default
  for (const pre of blocks) {
    const box = document.createElement('div')
    box.className = 'mermaid-diagram'
    // A diagram's own front-matter config (such as layout: elk) can persist
    // in Mermaid's global configuration, so each diagram starts from ours.
    mermaidLib.mermaidAPI?.reset?.()
    mermaidLib.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      layout: 'dagre',
      // Labels as SVG text, not HTML inside the SVG, so the sanitising pass keeps them.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: document.documentElement.dataset.theme === 'light' ? 'default' : 'dark',
    })
    try {
      const { svg } = await mermaidLib.render(`scrinotia-mermaid-${++mermaidSeq}`, pre.textContent)
      box.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'] })
    } catch (err) {
      box.classList.add('missing')
      box.textContent = `Mermaid: ${String(err.message ?? err).split('\n')[0]}`
    }
    if (pre.isConnected) pre.replaceWith(box)
  }
}

// Embedded notes (R3.7): each placeholder becomes a box with the note's name
// (a link to it) and its content, or the section or block named. Only one
// level is shown: an embed inside an embedded note is a plain link, so no
// note renders inside another twice and a loop of embeds cannot repeat.
async function fillNoteEmbeds(host, depth, chain) {
  for (const el of host.querySelectorAll(':scope .note-embed:not([data-filled])')) {
    el.dataset.filled = '1'
    const path = el.dataset.path
    const sub = el.dataset.sub || null
    const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
    if (depth > 1) {
      const a = document.createElement('a')
      a.className = 'embed-link'
      a.textContent = sub ? `${name} › ${sub}` : name
      a.setAttribute('data-wikilink', path.replace(/\.md$/i, '') + (sub ? `#${sub}` : ''))
      el.replaceWith(a)
      continue
    }
    const head = document.createElement('div')
    head.className = 'note-embed-head'
    const link = document.createElement('a')
    link.textContent = sub ? `${name} › ${sub.replace(/^\^/, '^')}` : name
    link.setAttribute('data-wikilink', path.replace(/\.md$/i, '') + (sub ? `#${sub}` : ''))
    head.append(link)
    const body = document.createElement('div')
    body.className = 'note-embed-body'
    el.replaceChildren(head, body)
    if (chain.has(path)) {
      body.className = 'note-embed-notice'
      body.textContent = 'This note embeds itself; it is not repeated.'
      continue
    }
    let text
    try {
      text = extractSection(await api.readNote(path), sub)
    } catch {
      text = null
    }
    if (text === null) {
      body.className = 'note-embed-notice'
      body.textContent = sub ? `No section “${sub}” in ${name}.` : `${name} could not be read.`
      continue
    }
    preview.render(text, body)
    await fillNoteEmbeds(body, depth + 1, new Set([...chain, path]))
    // A long note scrolls inside its box; Show all lets it run to full length.
    requestAnimationFrame(() => {
      if (body.scrollHeight <= body.clientHeight + 2) return
      const more = document.createElement('button')
      more.type = 'button'
      more.className = 'note-embed-more'
      more.textContent = 'Show all'
      more.addEventListener('click', () => {
        const open = el.classList.toggle('expanded')
        more.textContent = open ? 'Show less' : 'Show all'
      })
      el.append(more)
    })
  }
}

const assetUrlOf = (p) => assetBase + p.split('/').map(encodeURIComponent).join('/')

// PDFs, audio, video, HTML and text embedded in the note shown.
function fillAttachmentEmbeds() {
  for (const el of $('preview').querySelectorAll('.attachment-embed')) {
    renderAttachment(el, { path: el.dataset.path, url: assetUrlOf(el.dataset.path), api, embedded: true })
  }
}

function schedulePreview() {
  clearTimeout(previewTimer)
  if (notes.get(current)?.kind === 'base') return
  previewTimer = setTimeout(renderPreview, 120)
}

// In split mode the preview follows the editor's scroll position by proportion.
function syncScroll(cmView) {
  if (noteMode !== 'split') return
  const src = cmView.scrollDOM
  const max = src.scrollHeight - src.clientHeight
  const dst = $('preview')
  dst.scrollTop = max > 0 ? (src.scrollTop / max) * (dst.scrollHeight - dst.clientHeight) : 0
}

function setNoteMode(mode) {
  noteMode = mode
  $('note-area').className = `note-area mode-${mode}`
  for (const m of ['preview', 'split']) $(`mode-${m}`).classList.toggle('active', m === mode)
  if (mode === 'split') {
    editor.view.requestMeasure()
    editor.focus()
  }
}

// Links follow on click; Cmd/Ctrl+click or a middle click opens a new tab.
function previewLink(e, newTab) {
  const el = e.target.closest('[data-wikilink], [data-href]')
  if (!el) return
  e.preventDefault()
  const wikilink = el.getAttribute('data-wikilink')
  if (wikilink !== null) follow({ kind: 'wikilink', ref: wikilink, newTab })
  else follow({ kind: 'href', ref: el.getAttribute('data-href'), newTab })
}
$('preview').addEventListener('click', (e) => previewLink(e, e.metaKey || e.ctrlKey))
$('preview').addEventListener('auxclick', (e) => {
  if (e.button === 1) previewLink(e, true)
})
$('preview').addEventListener('contextmenu', async (e) => {
  const el = e.target.closest('[data-wikilink], [data-href]')
  if (!el) return
  e.preventDefault()
  const choice = await api.menu([
    { id: 'open', label: 'Open' },
    { id: 'tab', label: 'Open in new tab' },
  ])
  if (choice) previewLink({ target: el, preventDefault() {} }, choice === 'tab')
})

function files() {
  return flattenFiles(view.tree)
}

function updateResolver() {
  if (current) schedulePreview()
}

async function save(path) {
  const entry = notes.get(path)
  if (!entry) return
  clearTimeout(entry.timer)
  const state = path === current ? editor.getState() : entry.state
  const text = editor.text(state)
  if (text === entry.disk) {
    entry.dirty = false
    return
  }
  const previous = entry.disk
  entry.disk = text
  try {
    await api.writeNote(path, text)
    entry.dirty = false
    if (entry.kind === 'base' && path === current) showBase(path)
  } catch (err) {
    entry.disk = previous
    showError($('pane-error'), err)
  }
}

async function flushAll() {
  await Promise.all([...notes.keys()].filter((p) => notes.get(p).dirty).map(save))
}

function rememberCurrent() {
  if (current && notes.has(current)) notes.get(current).state = editor.getState()
}

// ---- .base files: table views (rendered in the main process) ----
let currentBase = null
let baseView = 0

async function showBase(path) {
  currentBase = path
  const out = await api.renderBase(path).catch((err) => ({ error: String(err.message ?? err), views: [] }))
  if (currentBase !== path) return
  drawBase($('preview'), out, {
    selected: baseView,
    onSelect: (n) => {
      baseView = n
      showBase(path)
    },
  })
}

// Bases embedded in the note shown (![[X.base]] or ![[X.base#View]]): each
// placeholder the preview left is filled with the base's views, with `this`
// referring to the note.
async function fillBaseEmbeds() {
  const note = current
  for (const el of $('preview').querySelectorAll('.base-embed')) {
    const out = await api.renderBase(el.dataset.base, note).catch((err) => ({ error: String(err.message ?? err), views: [] }))
    if (current !== note) return
    const want = el.dataset.view
    if (want) {
      const n = out.views.findIndex((v) => v.name === want)
      if (n < 0) {
        el.textContent = `No view named “${want}” in ${el.dataset.base}.`
        el.classList.add('missing')
        continue
      }
      drawBase(el, { ...out, views: [out.views[n]] }, { selected: 0, tabs: false })
    } else {
      const draw = (sel) => drawBase(el, out, { selected: sel, onSelect: draw })
      draw(0)
    }
  }
}

// Draws a base's output into host: view tabs (unless tabs is false), then
// the selected view as a table, cards or list.
function drawBase(host, out, { selected = 0, onSelect = () => {}, tabs: showTabs = true } = {}) {
  host.replaceChildren()
  if (out.error) {
    const p = document.createElement('p')
    p.className = 'missing'
    p.textContent = out.error
    host.append(p)
    return
  }
  const chosen = Math.min(selected, Math.max(out.views.length - 1, 0))
  if (showTabs) {
    const tabs = document.createElement('div')
    tabs.className = 'base-tabs'
    out.views.forEach((v, n) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = v.name
      b.classList.toggle('active', n === chosen)
      b.addEventListener('click', () => onSelect(n))
      tabs.append(b)
    })
    host.append(tabs)
  }
  const v = out.views[chosen]
  if (!v) return
  if (v.error) {
    const p = document.createElement('p')
    p.className = 'missing'
    p.textContent = v.error
    host.append(p)
    return
  }
  const openTarget = (cell) => {
    if (cell.path) openPath(cell.path)
    else if (cell.target) follow({ kind: 'wikilink', ref: cell.target })
  }
  const assetUrl = (p) => assetBase + p.split('/').map(encodeURIComponent).join('/')
  const notices = [...(out.notices ?? []), ...(v.notices ?? [])]
  for (const n of notices) {
    const p = document.createElement('p')
    p.className = 'notice'
    p.textContent = n
    host.append(p)
  }
  const count = document.createElement('p')
  count.className = 'muted'
  // With groupOrder, only the listed groups are shown, so count what is shown.
  const shown = v.groups ? v.groups.reduce((n, g) => n + g.rows.length, 0) : v.rows.length
  count.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'}`
  if (v.type === 'cards' || v.type === 'list') {
    host.append(renderItems(v, { openTarget, assetUrl }), count)
    return
  }
  const table = document.createElement('table')
  table.className = 'base-table'
  const head = table.createTHead().insertRow()
  for (const c of v.columns) {
    const th = document.createElement('th')
    th.textContent = c.label
    head.append(th)
  }
  const tbody = table.createTBody()
  const addRow = (into, r) => {
    const tr = into.insertRow()
    r.cells.forEach((cell, k) => {
      const td = tr.insertCell()
      // The file's own name opens the row's file.
      const own = ['file.name', 'file.basename', 'file.path'].includes(v.columns[k].id)
      const shown = own ? { ...cell, t: 'link', path: r.path } : cell
      td.className = `cell-${shown.t}`
      td.append(renderCell(shown, { openTarget, assetUrl }))
    })
  }
  // A summary row: each summarised column shows its summary's name and value.
  const addSummaries = (into, sums, cls) => {
    if (!sums) return
    const tr = into.insertRow()
    tr.className = cls
    sums.forEach((s) => {
      const td = tr.insertCell()
      if (!s) return
      const label = document.createElement('span')
      label.className = 'summary-name'
      label.textContent = `${s.name} `
      td.className = `cell-${s.cell.t}`
      td.append(label, renderCell(s.cell, { openTarget, assetUrl }))
    })
  }
  if (v.groups) {
    for (const g of v.groups) {
      const head = tbody.insertRow()
      head.className = 'group-row'
      const td = head.insertCell()
      td.colSpan = v.columns.length
      td.append(g.key.t === 'empty' ? document.createTextNode('(no value)') : renderCell(g.key, { openTarget, assetUrl }))
      const count = document.createElement('span')
      count.className = 'muted'
      count.textContent = ` ${g.rows.length}`
      td.append(count)
      for (const r of g.rows) addRow(tbody, r)
      addSummaries(tbody, g.summaries, 'summary-row group-summary')
    }
  } else {
    for (const r of v.rows) addRow(tbody, r)
  }
  if (v.summaries) addSummaries(table.createTFoot(), v.summaries, 'summary-row')
  host.append(table, count)
}

// Cards and list views: one item per entry. In a card, the first image among
// its properties is the card's picture and the file's own name its title; in
// a list, the first property leads and the rest follow it on the same line.
const IMAGE_PATH = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const OWN = ['file.name', 'file.basename', 'file.path']

function renderItems(v, opts) {
  const wrap = document.createElement('div')
  const one = (r) => {
    const cells = r.cells.map((cell, k) => ({ cell: OWN.includes(v.columns[k].id) ? { ...cell, t: 'link', path: r.path } : cell, col: v.columns[k] }))
    if (v.type === 'list') {
      const li = document.createElement('li')
      li.className = 'base-list-item'
      cells.forEach(({ cell, col }, k) => {
        if (cell.t === 'empty') return
        if (k) {
          const sep = document.createElement('span')
          sep.className = 'muted'
          sep.textContent = k === 1 ? ' — ' : ' · '
          li.append(sep)
        }
        const span = document.createElement('span')
        span.title = col.label
        span.append(renderCell(cell, opts))
        li.append(span)
      })
      return li
    }
    const card = document.createElement('div')
    card.className = 'base-card'
    const imageAt = cells.findIndex(({ cell }) => cell.t === 'image' || (cell.t === 'link' && cell.path && IMAGE_PATH.test(cell.path)))
    if (imageAt >= 0) {
      const { cell } = cells[imageAt]
      const img = document.createElement('img')
      img.className = 'base-card-image'
      img.src = cell.t === 'image' && !cell.path ? cell.src : opts.assetUrl(cell.path)
      img.alt = cell.text
      card.append(img)
    }
    const titleAt = cells.findIndex(({ col }) => OWN.includes(col.id))
    const title = document.createElement('div')
    title.className = 'base-card-title'
    title.append(renderCell(titleAt >= 0 ? cells[titleAt].cell : { t: 'link', path: r.path, text: r.path.split('/').pop() }, opts))
    card.append(title)
    cells.forEach(({ cell, col }, k) => {
      if (k === imageAt || k === titleAt || cell.t === 'empty') return
      const line = document.createElement('div')
      line.className = 'base-card-prop'
      if (col.label) {
        const label = document.createElement('span')
        label.className = 'muted'
        label.textContent = `${col.label} `
        line.append(label)
      }
      line.append(renderCell(cell, opts))
      card.append(line)
    })
    return card
  }
  const container = () => {
    const c = document.createElement(v.type === 'list' ? 'ul' : 'div')
    c.className = v.type === 'list' ? 'base-list' : 'base-cards'
    return c
  }
  if (v.groups) {
    for (const g of v.groups) {
      const h = document.createElement('h4')
      h.className = 'base-group-head'
      h.append(g.key.t === 'empty' ? document.createTextNode('(no value)') : renderCell(g.key, opts))
      const c = container()
      c.append(...g.rows.map(one))
      wrap.append(h, c)
    }
  } else {
    const c = container()
    c.append(...v.rows.map(one))
    wrap.append(c)
  }
  return wrap
}

async function showNote(path) {
  if (path === current) return
  rememberCurrent()
  if (current && notes.get(current)?.dirty) await save(current)
  current = path
  hideConflict()
  const body = $('note-body')
  const entryInfo = path ? findEntry(view.tree, path) : null
  currentBase = null
  const kind = entryInfo?.type === 'base' ? 'base' : 'note'
  if (entryInfo?.type === 'attachment') {
    current = null
    body.textContent = ''
    $('modes').hidden = true
    setNoteMode('preview')
    $('note-area').hidden = false
    await renderAttachment($('preview'), { path, url: assetUrlOf(path), api })
    return
  }
  if (!path || (entryInfo?.type !== 'note' && entryInfo?.type !== 'base')) {
    $('note-area').hidden = true
    $('modes').hidden = true
    body.textContent = ''
    current = null
    return
  }
  body.textContent = ''
  let entry = notes.get(path)
  if (!entry) {
    try {
      const text = await api.readNote(path)
      entry = { kind, state: editor.createState(text, kind === 'base' ? 'yaml' : 'markdown'), disk: text, dirty: false, timer: null }
      notes.set(path, entry)
    } catch (err) {
      showError($('pane-error'), err)
      $('note-area').hidden = true
      return
    }
  }
  if (current !== path) return // another note was chosen while this one loaded
  $('note-area').hidden = false
  $('modes').hidden = false
  editor.setState(entry.state)
  renderPreview()
  updateResolver()
}

async function renderPane() {
  showError($('pane-error'), null)
  $('entry-actions').hidden = !view.selected
  $('note-path').textContent = view.openNote ?? view.selected?.path ?? ''
  await showNote(view.openNote)
  renderOutline()
  await renderLinks()
}

// ---- links panel (R4.3, R4.4) ----
function hitItem(primary, secondary, onClick, cls) {
  const li = document.createElement('li')
  const a = document.createElement('span')
  a.className = `hit-path${cls ? ' ' + cls : ''}`
  a.textContent = primary
  li.append(a)
  if (secondary) {
    const b = document.createElement('span')
    b.className = 'hit-line'
    b.textContent = secondary
    li.append(b)
  }
  if (onClick) {
    // onClick(newTab): Cmd/Ctrl+click and a middle click open a new tab.
    li.addEventListener('click', (e) => onClick(e.metaKey || e.ctrlKey))
    li.addEventListener('auxclick', (e) => {
      if (e.button === 1) onClick(true)
    })
    li.addEventListener('contextmenu', async (e) => {
      e.preventDefault()
      const choice = await api.menu([
        { id: 'open', label: 'Open' },
        { id: 'tab', label: 'Open in new tab' },
      ])
      if (choice) onClick(choice === 'tab')
    })
  }
  return li
}

function fillList(id, items) {
  $(id).replaceChildren(...items)
  $(`${id}-count`).textContent = items.length ? String(items.length) : ''
}

async function renderLinks() {
  const path = current
  if (!path) {
    for (const id of ['backlinks', 'unlinked', 'outgoing']) fillList(id, [])
    return
  }
  try {
    const [back, unlinked, out] = await Promise.all([api.backlinks(path), api.unlinkedMentions(path), api.outgoing(path)])
    if (path !== current) return
    fillList('backlinks', back.map((b) => hitItem(b.source.replace(/\.md$/i, ''), b.context, (newTab) => openPath(b.source, { newTab }))))
    fillList('unlinked', unlinked.map((m) => hitItem(m.source.replace(/\.md$/i, ''), m.context, (newTab) => openPath(m.source, { newTab }))))
    fillList(
      'outgoing',
      out.map((o) =>
        o.resolved
          ? hitItem(o.text, o.resolved, (newTab) => openPath(o.resolved, { newTab }))
          : hitItem(o.text, 'not found', (newTab) => follow({ kind: 'wikilink', ref: o.target, newTab }), 'unresolved'),
      ),
    )
  } catch (err) {
    showError($('pane-error'), err)
  }
}

// ---- search (R5) ----
let searchTimer = null
let searchSeq = 0
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(runSearch, 150)
})
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('search').value = ''
    runSearch()
  }
})

async function runSearch() {
  if (sidePane === 'tags') return
  const q = $('search').value.trim()
  const seq = ++searchSeq
  if (!q) {
    $('results').hidden = true
    $('tree').hidden = false
    return
  }
  let results = []
  let problem = null
  try {
    const out = await api.search(q)
    results = out.results
    problem = out.error ?? null
  } catch (err) {
    showError($('pane-error'), err)
  }
  if (seq !== searchSeq) return
  $('tree').hidden = true
  $('results').hidden = false
  const items = results.map((r) =>
    draggableItem(r.path, hitItem(
      r.path.replace(/\.md$/i, ''),
      r.matches.map((m) => m.context).join(' · '),
      (newTab) => openPath(r.path, { newTab }),
    )),
  )
  if (items.length === 0) {
    const li = document.createElement('li')
    li.className = 'info'
    li.textContent = problem ?? 'No matches.'
    items.push(li)
  }
  $('results').replaceChildren(...items)
}

function forgetNotes(match) {
  for (const p of [...notes.keys()]) {
    if (match(p)) {
      clearTimeout(notes.get(p).timer)
      notes.delete(p)
    }
  }
  if (current && !notes.has(current)) {
    current = null
    $('note-area').hidden = true
    $('modes').hidden = true
  }
}

// ---- modes (R3.1) ----
for (const mode of ['preview', 'split']) $(`mode-${mode}`).addEventListener('click', () => setNoteMode(mode))

// ---- following links ----
async function openPath(path, { newTab = false } = {}) {
  view.selected = { path, type: findEntry(view.tree, path)?.type ?? 'note' }
  showInTab(path, { newTab })
  let folder = parentOf(path)
  while (folder) {
    view.expanded.add(folder)
    folder = parentOf(folder)
  }
  renderTree()
  await renderPane()
}

async function follow({ kind, ref, newTab = false }) {
  if (kind === 'href') {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
      await run(() => api.openExternal(ref))
      return
    }
    let decoded = ref
    try {
      decoded = decodeURIComponent(ref)
    } catch {
      // keep the raw form
    }
    const target = decoded.split('#')[0]
    const hit = target ? resolveRelative(target, current, files()) : null
    if (hit) await openPath(hit, { newTab })
    else showError($('pane-error'), `No note at ${decoded}`)
    return
  }
  const { target } = splitLink(ref)
  if (!target) return
  const hit = resolveLink(target, current, files())
  if (hit) {
    await openPath(hit, { newTab })
    return
  }
  if (!window.confirm(`“${target}” does not exist. Create it?`)) return
  const name = target.split('/').pop()
  const rel = await run(() => api.createNote(parentOf(target), name))
  if (!rel) return
  await refreshTree()
  await openPath(rel, { newTab })
}

// ---- conflicts (R1.5) ----
function hideConflict() {
  conflictText = null
  $('conflict').hidden = true
}
$('keep-mine').addEventListener('click', async () => {
  const entry = notes.get(current)
  if (entry && conflictText !== null) {
    entry.disk = conflictText
    entry.dirty = true
    await save(current)
  }
  hideConflict()
})
$('load-disk').addEventListener('click', () => {
  const entry = notes.get(current)
  if (entry && conflictText !== null) {
    clearTimeout(entry.timer)
    loadDiskText(entry, conflictText)
  }
  hideConflict()
})

function loadDiskText(entry, text) {
  entry.disk = text
  entry.dirty = false
  const fresh = editor.createState(text)
  if (fresh.lineBreak !== editor.getState().lineBreak) {
    entry.state = fresh
    editor.setState(fresh)
  } else {
    editor.replaceFromDisk(text)
    entry.state = editor.getState()
  }
  renderPreview()
}

api.onFlush(flushAll)

// ---- entry actions ----
async function run(action) {
  showError($('pane-error'), null)
  try {
    return await action()
  } catch (err) {
    showError($('pane-error'), err)
    return null
  }
}

async function rename(from, to) {
  await flushAll()
  const done = await run(() => api.move(from, to))
  if (!done) return
  if (done.skipped?.length) {
    showError($('pane-error'), `Links were not updated in ${done.skipped.length} note(s) that changed meanwhile: ${done.skipped.join(', ')}`)
  }
  const remap = (p) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p)
  if (view.selected) view.selected.path = remap(view.selected.path)
  retab(remap)
  view.expanded = new Set([...view.expanded].map(remap))
  view.expanded.add(parentOf(to))
  rememberCurrent()
  for (const [p, entry] of [...notes]) {
    if (remap(p) !== p) {
      notes.delete(p)
      notes.set(remap(p), entry)
    }
  }
  if (current) current = remap(current)
  await refreshTree()
  renderPane()
}

$('new-note').addEventListener('click', async () => {
  const folder = targetFolder()
  const rel = await run(() => api.createNote(folder))
  if (!rel) return
  if (folder) view.expanded.add(folder)
  view.selected = { path: rel, type: 'note' }
  showInTab(rel, { newTab: true })
  await refreshTree()
  renderPane()
  startRename()
})

$('new-folder').addEventListener('click', async () => {
  const folder = targetFolder()
  const rel = await run(() => api.createFolder(folder))
  if (!rel) return
  if (folder) view.expanded.add(folder)
  view.selected = { path: rel, type: 'folder' }
  await refreshTree()
  renderPane()
  startRename()
})

$('delete').addEventListener('click', async () => {
  const sel = view.selected
  if (!sel) return
  if (!window.confirm(`Move “${sel.path}” to the trash?`)) return
  await flushAll()
  const done = await run(async () => {
    await api.trash(sel.path)
    return true
  })
  if (!done) return
  view.selected = null
  retab((p) => (p === sel.path || p.startsWith(sel.path + '/') ? null : p))
  forgetNotes((p) => p === sel.path || p.startsWith(sel.path + '/'))
  await refreshTree()
  renderPane()
})

$('rename').addEventListener('click', startRename)

// Inline rename: the row becomes an input; Enter commits, Escape cancels. A
// note's .md extension is kept when the new name omits it.
function startRename() {
  const sel = view.selected
  if (!sel) return
  const li = document.querySelector(`#tree li[data-path="${CSS.escape(sel.path)}"]`)
  if (!li) return
  const row = li.querySelector(':scope > .row')
  const current = sel.path.slice(sel.path.lastIndexOf('/') + 1)
  const input = document.createElement('input')
  input.value = sel.type === 'note' ? current.replace(/\.md$/i, '') : current
  view.renaming = true
  row.replaceWith(input)
  input.focus()
  input.select()
  let finished = false
  const finish = async (commit) => {
    if (finished) return
    finished = true
    view.renaming = false
    let name = input.value.trim()
    if (sel.type === 'note' && name && !/\.md$/i.test(name)) name += '.md'
    if (!commit || !name || name === current || name.includes('/')) {
      if (name.includes('/')) showError($('pane-error'), 'A name cannot contain “/”.')
      renderTree()
      return
    }
    await rename(sel.path, join(parentOf(sel.path), name))
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

// ---- external changes (R1.5) ----
// ---- quick switcher (R2.5): Cmd/Ctrl+O, type part of a name, Enter ----
const switcher = { items: [], at: 0 }
function openSwitcher() {
  if ($('workspace').hidden) return
  $('switcher').hidden = false
  $('switcher-input').value = ''
  drawSwitcher()
  $('switcher-input').focus()
}
function closeSwitcher() {
  $('switcher').hidden = true
}
function drawSwitcher() {
  const q = $('switcher-input').value
  const all = files()
  // With no query, notes in tree order; otherwise the best fuzzy matches.
  switcher.items = q.trim() ? fuzzyRank(q, all, 50) : all.filter((p) => /\.md$/i.test(p)).slice(0, 50)
  switcher.at = Math.min(switcher.at, Math.max(0, switcher.items.length - 1))
  if (!q.trim()) switcher.at = 0
  $('switcher-list').replaceChildren(
    ...switcher.items.map((p, i) => {
      const li = document.createElement('li')
      li.className = i === switcher.at ? 'active' : ''
      li.setAttribute('role', 'option')
      const name = document.createElement('span')
      name.textContent = p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '')
      const folder = document.createElement('span')
      folder.className = 'muted'
      folder.textContent = p.includes('/') ? ` ${p.slice(0, p.lastIndexOf('/'))}` : ''
      li.append(name, folder)
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        chooseSwitcher(i)
      })
      return li
    }),
  )
  $('switcher-list').querySelector('.active')?.scrollIntoView({ block: 'nearest' })
}
function chooseSwitcher(i, newTab = false) {
  const p = switcher.items[i]
  closeSwitcher()
  if (p) openPath(p, { newTab })
}
$('switcher-input').addEventListener('input', () => {
  switcher.at = 0
  drawSwitcher()
})
$('switcher-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = switcher.items.length
    if (n) switcher.at = (switcher.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
    drawSwitcher()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    chooseSwitcher(switcher.at, e.metaKey || e.ctrlKey)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeSwitcher()
  }
})
$('switcher').addEventListener('mousedown', (e) => {
  if (e.target === $('switcher')) closeSwitcher()
})
api.onQuickSwitcher(openSwitcher)
// The menu's accelerator normally opens it; this covers a focus the menu misses.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    openSwitcher()
  }
})

// ---- tags pane (R4.5): every tag with the number of notes carrying it,
// nested tags under their parents; a click searches for the tag ----
let sidePane = 'files'
function setSidePane(which) {
  sidePane = which
  $('show-files').classList.toggle('active', which === 'files')
  $('show-tags').classList.toggle('active', which === 'tags')
  $('tag-list').hidden = which !== 'tags'
  if (which === 'tags') {
    $('tree').hidden = true
    $('results').hidden = true
    renderTags()
  } else runSearch()
}
$('show-files').addEventListener('click', () => setSidePane('files'))
$('show-tags').addEventListener('click', () => setSidePane('tags'))

// A tag's count is the notes carrying it or any tag nested under it.
function tagRows(pairs, notesByTag) {
  const names = new Set()
  for (const [tag] of pairs) {
    const parts = tag.split('/')
    for (let i = 1; i <= parts.length; i++) names.add(parts.slice(0, i).join('/'))
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .map((name) => ({ name, depth: name.split('/').length - 1, label: name.split('/').pop(), count: notesByTag(name) }))
}

async function renderTags() {
  let pairs = []
  try {
    pairs = await api.tags()
  } catch (err) {
    showError($('pane-error'), err)
  }
  if (sidePane !== 'tags') return
  // pairs: [tag, notes carrying it or a tag nested under it], parents included.
  const counts = new Map(pairs)
  const rows = tagRows(pairs, (name) => counts.get(name) ?? 0)
  const list = $('tag-list')
  if (!rows.length) {
    const li = document.createElement('li')
    li.className = 'info'
    li.textContent = 'No tags in this vault.'
    list.replaceChildren(li)
    return
  }
  list.replaceChildren(
    ...rows.map((r) => {
      const li = document.createElement('li')
      li.style.paddingLeft = `${12 + r.depth * 14}px`
      const name = document.createElement('span')
      name.textContent = `#${r.label}`
      const count = document.createElement('span')
      count.className = 'muted tag-count'
      count.textContent = String(r.count)
      li.append(name, count)
      li.title = `#${r.name}`
      li.addEventListener('click', () => {
        $('search').value = `tag:${r.name}`
        setSidePane('files')
      })
      return li
    }),
  )
}

// ---- drawers (R6.7): each side panel opens and closes (its button in the
// note pane's header, the View menu, Cmd/Ctrl+\ and Cmd/Ctrl+Shift+\), and
// its width is set by dragging the splitter beside it (double-click resets).
// The state is remembered on this machine. ----
const DEFAULT_WIDTH = 280
const layout = { leftOpen: true, rightOpen: true, leftWidth: DEFAULT_WIDTH, rightWidth: DEFAULT_WIDTH }
let saveLayoutTimer = null

function applyLayout() {
  const ws = $('workspace')
  ws.style.setProperty('--left-width', `${layout.leftWidth}px`)
  ws.style.setProperty('--right-width', `${layout.rightWidth}px`)
  ws.classList.toggle('left-closed', !layout.leftOpen)
  ws.classList.toggle('right-closed', !layout.rightOpen)
  $('toggle-left').classList.toggle('closed', !layout.leftOpen)
  $('toggle-right').classList.toggle('closed', !layout.rightOpen)
  editor.view.requestMeasure()
}

function saveLayout() {
  clearTimeout(saveLayoutTimer)
  saveLayoutTimer = setTimeout(() => api.setLayout({ ...layout }).catch(() => {}), 300)
}

function toggleDrawer(side) {
  if (side === 'left') layout.leftOpen = !layout.leftOpen
  else layout.rightOpen = !layout.rightOpen
  applyLayout()
  saveLayout()
}

// Each drawer is at least 160 px and at most 600 px, and the note pane keeps
// at least 320 px.
function clampWidth(side, w) {
  const other = side === 'left' ? (layout.rightOpen ? layout.rightWidth : 0) : layout.leftOpen ? layout.leftWidth : 0
  const room = window.innerWidth - other - 320 - 10
  return Math.round(Math.max(160, Math.min(600, room, w)))
}

function dragSplitter(side) {
  const bar = $(side === 'left' ? 'split-left' : 'split-right')
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    bar.setPointerCapture(e.pointerId)
    bar.classList.add('dragging')
    $('workspace').classList.add('resizing')
    const move = (ev) => {
      const w = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX
      layout[side === 'left' ? 'leftWidth' : 'rightWidth'] = clampWidth(side, w)
      applyLayout()
    }
    const up = () => {
      bar.classList.remove('dragging')
      $('workspace').classList.remove('resizing')
      bar.removeEventListener('pointermove', move)
      bar.removeEventListener('pointerup', up)
      saveLayout()
    }
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', up)
  })
  bar.addEventListener('dblclick', () => {
    layout[side === 'left' ? 'leftWidth' : 'rightWidth'] = DEFAULT_WIDTH
    applyLayout()
    saveLayout()
  })
}

$('toggle-left').addEventListener('click', () => toggleDrawer('left'))
$('toggle-right').addEventListener('click', () => toggleDrawer('right'))
api.onToggleDrawer(toggleDrawer)
dragSplitter('left')
dragSplitter('right')
api
  .getLayout()
  .then((saved) => {
    if (typeof saved.leftOpen === 'boolean') layout.leftOpen = saved.leftOpen
    if (typeof saved.rightOpen === 'boolean') layout.rightOpen = saved.rightOpen
    if (Number.isFinite(saved.leftWidth)) layout.leftWidth = Math.max(160, Math.min(600, saved.leftWidth))
    if (Number.isFinite(saved.rightWidth)) layout.rightWidth = Math.max(160, Math.min(600, saved.rightWidth))
  })
  .catch(() => {})
  .finally(applyLayout)

// ---- dropping files on a note (R2.7): files from outside the vault are
// copied into its attachment folder; files dragged from the tree or search
// results are already in the vault. Either way a link goes into the note:
// an embed for what the preview shows inline, a plain link otherwise. In the
// split editor it goes where the file is dropped; in the preview, at the end.
function draggableItem(path, li) {
  li.draggable = true
  li.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-scrinotia-path', path))
  return li
}

function linkFor(path) {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const isNote = /\.md$/i.test(name)
  // The shortest form that still resolves to this file from the open note.
  const short = isNote ? name.replace(/\.md$/i, '') : name
  const target = resolveLink(short, current, files()) === path ? short : isNote ? path.replace(/\.md$/i, '') : path
  const embed = !isNote && attachmentKind(path) !== 'other'
  return `${embed ? '!' : ''}[[${target}]]`
}

function canDrop(e) {
  const t = e.dataTransfer?.types ?? []
  return current && notes.get(current)?.kind === 'note' && (t.includes('Files') || t.includes('text/x-scrinotia-path'))
}

$('note-area').addEventListener(
  'dragover',
  (e) => {
    if (!canDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  },
  true,
)

$('note-area').addEventListener(
  'drop',
  async (e) => {
    if (!canDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    const note = current
    const inEditor = noteMode === 'split' && $('editor').contains(e.target)
    const pos = inEditor ? editor.posAt(e.clientX, e.clientY) : null
    const paths = []
    const vaultPath = e.dataTransfer.getData('text/x-scrinotia-path')
    if (vaultPath) paths.push(vaultPath)
    for (const file of e.dataTransfer.files) {
      const source = api.pathForFile(file)
      if (!source) continue
      const rel = await run(() => api.importFile(source))
      if (rel) paths.push(rel)
    }
    if (!paths.length || current !== note) return
    await refreshTree()
    const links = paths.map(linkFor).join('\n')
    if (pos !== null) editor.insert(links, pos)
    else {
      const text = editor.text()
      editor.insert(`${text.length && !text.endsWith('\n') ? '\n' : ''}${links}\n`)
    }
  },
  true,
)

api.onVaultChanged(async (paths) => {
  if ($('workspace').hidden) return
  await refreshTree()
  updateResolver()
  for (const path of paths) {
    const entry = notes.get(path)
    if (!entry) continue
    let disk
    try {
      disk = await api.readNote(path)
    } catch {
      forgetNotes((p) => p === path) // deleted or moved away
      continue
    }
    if (disk === entry.disk) continue // our own save, or no change
    if (path !== current) {
      if (entry.dirty) continue // resolved when the note is shown and saved
      notes.delete(path)
      continue
    }
    if (entry.dirty) {
      conflictText = disk
      $('conflict').hidden = false
    } else {
      loadDiskText(entry, disk)
    }
  }
  if (currentBase) showBase(currentBase)
  else if (!current) renderPane()
  else renderLinks()
  if ($('search').value.trim()) runSearch()
  if (sidePane === 'tags') renderTags()
})

$('version').textContent = `version ${api.version}`
renderRecent()
