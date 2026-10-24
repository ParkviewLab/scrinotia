// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault browser and editor: a start screen with recent vaults, then a
// file tree and the note editor.

import { createEditor } from './editor/editor.js'
import { createPreview, LINE } from './preview.js'
import { orderedAnchors, topForLine, lineForTop } from './sourceLines.js'
import { NOTE_MODES, nextMode, clampShare, DEFAULT_SHARE } from './noteModes.js'
import { taskToggle } from './tasks.js'
import { findMatches } from './previewFind.js'
import { printTitle, printable } from './printing.js'
import { EditorView } from '@codemirror/view'
import { renderCell } from './baseCells.js'
import { renderAttachment, attachmentKind } from './attachments.js'
import { extractSection, listHeadings } from '../../shared/sections.js'
import { fuzzyRank } from './fuzzy.js'
import { diskConflict } from './conflicts.js'
import { PATH_TYPE, FOLDER_TYPE, dragData, noteAccepts } from './dragTypes.js'
import { attachPanZoom, keepViewsFor } from './diagramView.js'
import { mountModel } from './modelViewer.js'
import { setModelColour, mountPreviewModel, normaliseColour, colourCss, DEFAULT_MODEL_COLOUR } from './modelViewer.js'
import 'katex/dist/katex.min.css'
import DOMPurify from 'dompurify'
import { splitLink } from '../../shared/markdown.js'
import { resolveLink, resolveRelative, flattenFiles } from '../../shared/links.js'
import nameCardUrl from '../../../brand/scrinotia-icon-kit/brand/scrinotia-name-card.png'

const api = window.scrinotia
// The note a full-screen diagram or model belongs to (R3.8.1), and whether
// the window was full screen before.
const fullView = { note: null, wasFull: false }
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
// ---- printing (R3.9): the open note as rendered, through the system's
// print dialog, in any mode. The page's print styles leave out everything
// but the note and its name; the light theme's colours are used whatever
// the screen's, so a dark screen is switched to light, its diagrams drawn
// again, for the time the dialog is open. A base or an attachment in the
// pane is not printed. ----
let printing = false
async function printNote() {
  if (printing || !current || !printable(notes.get(current)?.kind) || $('note-area').hidden) return
  printing = true
  const theme = document.documentElement.dataset.theme
  try {
    if (theme !== 'light') applyTheme('light')
    await previewSettled
    await Promise.all([...$('preview').querySelectorAll('img')].map((img) => img.decode().catch(() => {})))
    await api.print()
  } finally {
    if (theme !== 'light') applyTheme(theme)
    printing = false
  }
}
api.onPrint(printNote)

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

// The source editor's preferences (R6.4), a vault setting of their own in
// editor.json: spell checking in notes, on unless turned off.
let editorPrefs = {}
async function loadEditorPrefs() {
  try {
    editorPrefs = (await api.getSettings('editor')).values
  } catch {
    editorPrefs = {}
  }
  editor.setSpellcheck(editorPrefs.spellcheck !== false)
}

async function loadVaultSettings() {
  loadEditorPrefs()
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
  api
    .getSettings('tree')
    .then(({ values }) => {
      $('settings-tree-order').value = values.order === 'alphabetical' ? 'alphabetical' : 'described'
    })
    .catch(() => {})
  $('settings-spellcheck').value = editorPrefs.spellcheck === false ? 'off' : 'on'
  api
    .getPrefs()
    .then((p) => ($('settings-workspaces').checked = p.workspaces))
    .catch(() => {})
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

// The file tree's order (R2.2.1), a vault setting of its own; the main
// process sorts the tree by it.
$('settings-tree-order').addEventListener('change', async (e) => {
  try {
    await api.setSettings('tree', { order: e.target.value })
    await refreshTree()
  } catch (err) {
    showError($('pane-error'), err)
  }
})

// Workspaces (R2.8): a preference of this computer, read when a folder is opened.
$('settings-workspaces').addEventListener('change', async (e) => {
  try {
    await api.setPrefs({ workspaces: e.target.checked })
  } catch (err) {
    showError($('pane-error'), err)
  }
})

$('settings-spellcheck').addEventListener('change', async (e) => {
  editorPrefs = { ...editorPrefs, spellcheck: e.target.value === 'on' }
  editor.setSpellcheck(editorPrefs.spellcheck)
  try {
    await api.setSettings('editor', editorPrefs)
  } catch (err) {
    showError($('pane-error'), err)
  }
})

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
    tabs.hist = []
    tabs.active = -1
    renderTabs()
    view.expanded = new Set()
    notes.clear()
    current = null
    $('search').value = ''
    runSearch()
    assetBase = opened.assetBase ?? ''
    // A workspace (R2.8) is read-only: no editing, creating, renaming,
    // moving, trashing or dropping; the main process refuses them as well.
    readOnly = opened.readOnly === true
    document.body.classList.toggle('read-only', readOnly)
    editor.setReadOnly(readOnly)
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
  row.addEventListener('dragstart', (e) => {
    for (const [type, value] of Object.entries(dragData(entry.path, entry.type === 'folder'))) e.dataTransfer.setData(type, value)
  })
  row.addEventListener('click', (e) => select(entry, { newTab: e.metaKey || e.ctrlKey }))
  row.addEventListener('auxclick', (e) => {
    if (e.button === 1 && entry.type !== 'folder') select(entry, { newTab: true })
  })
  row.addEventListener('contextmenu', async (e) => {
    e.preventDefault()
    const isFolder = entry.type === 'folder'
    const choice = await api.menu([
      ...(isFolder ? [] : [{ id: 'open', label: 'Open' }, { id: 'tab', label: 'Open in new tab' }]),
      { id: 'reveal', label: REVEAL_LABEL },
      ...(readOnly ? [] : [{ type: 'separator' }, { id: 'rename', label: 'Rename' }, { id: 'trash', label: 'Move to trash' }]),
    ])
    if (choice === 'open') select(entry)
    if (choice === 'tab') select(entry, { newTab: true })
    if (choice === 'reveal') api.showPath(entry.path).catch((err) => showError($('pane-error'), err))
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
      moveInto(e.dataTransfer.getData(PATH_TYPE), entry.path)
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
  moveInto(e.dataTransfer.getData(PATH_TYPE), '')
})

async function moveInto(from, folder) {
  if (readOnly || !from || parentOf(from) === folder) return
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
// hist runs alongside list: each tab's history (R2.5.1), { back, fwd }, each
// a list of { path, scroll } steps, the nearest last in back and first in fwd.
const tabs = { list: [], active: -1, hist: [] }
const HISTORY_LIMIT = 50
const newHistory = () => ({ back: [], fwd: [] })

function showInTab(path, { newTab = false } = {}) {
  const at = tabs.list.indexOf(path)
  if (at >= 0) tabs.active = at
  else if (newTab || tabs.active < 0) {
    tabs.list.splice(tabs.active + 1, 0, path)
    tabs.hist.splice(tabs.active + 1, 0, newHistory())
    tabs.active += 1
  } else {
    // The tab moves on: what it showed becomes a step back, and the steps
    // ahead are discarded.
    const h = tabs.hist[tabs.active]
    h.back.push({ path: tabs.list[tabs.active], scroll: $('preview').scrollTop })
    if (h.back.length > HISTORY_LIMIT) h.back.splice(0, h.back.length - HISTORY_LIMIT)
    h.fwd = []
    tabs.list[tabs.active] = path
  }
  view.openNote = path
  renderTabs()
}

// Moves the active tab `by` steps through its history (negative is back),
// skipping steps whose file no longer exists, and restores the scroll.
async function goHistory(by) {
  const i = tabs.active
  if (i < 0 || !by) return
  const h = tabs.hist[i]
  const steps = [...h.back, { path: tabs.list[i], scroll: $('preview').scrollTop }, ...h.fwd]
  const here = h.back.length
  let to = here + by
  const dir = Math.sign(by)
  while (to >= 0 && to < steps.length && !findEntry(view.tree, steps[to].path)) to += dir
  if (to < 0 || to >= steps.length || to === here) return
  const target = steps[to]
  tabs.hist[i] = { back: steps.slice(0, to), fwd: steps.slice(to + 1) }
  tabs.list[i] = target.path
  view.openNote = target.path
  view.selected = { path: target.path, type: findEntry(view.tree, target.path)?.type ?? 'note' }
  renderTabs()
  renderTree()
  await renderPane()
  // Embeds and diagrams can grow the page after it is drawn, so the scroll
  // is set again once they have had a moment.
  $('preview').scrollTop = target.scroll
  alignSoon(editorFollowPreview)
  setTimeout(() => {
    $('preview').scrollTop = target.scroll
    if (noteMode === 'split') editorFollowPreview()
  }, 250)
}

function drawHistoryButtons() {
  const h = tabs.hist[tabs.active]
  $('nav-back').disabled = !h?.back.length
  $('nav-fwd').disabled = !h?.fwd.length
}

// Back and Forward (R2.5.1): the buttons (a click steps; holding one or a
// right-click lists the steps), the keys, the mouse's side buttons and, on
// macOS, the trackpad swipe.
for (const [id, dir] of [
  ['nav-back', -1],
  ['nav-fwd', 1],
]) {
  const button = $(id)
  let hold = null
  let held = false
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    held = false
    hold = setTimeout(() => {
      held = true
      historyMenu(dir)
    }, 450)
  })
  const cancel = () => clearTimeout(hold)
  button.addEventListener('pointerup', cancel)
  button.addEventListener('pointerleave', cancel)
  button.addEventListener('click', () => {
    if (!held) goHistory(dir)
  })
  button.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    historyMenu(dir)
  })
}
window.addEventListener('keydown', (e) => {
  if ($('workspace').hidden || !$('diagram-full').hidden) return
  const mac = api.platform === 'darwin'
  let dir = 0
  if (mac && e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && (e.key === '[' || e.key === ']')) {
    // In the editor these keys outdent and indent.
    if (e.target.closest?.('.cm-editor')) return
    dir = e.key === '[' ? -1 : 1
  } else if (!mac && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    dir = e.key === 'ArrowLeft' ? -1 : 1
  }
  if (!dir) return
  e.preventDefault()
  goHistory(dir)
})
window.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return
  e.preventDefault()
  goHistory(e.button === 3 ? -1 : 1)
})
api.onSwipe((direction) => {
  if (direction === 'right') goHistory(-1)
  if (direction === 'left') goHistory(1)
})

// The steps one way, nearest first, as a menu to jump to (R2.5.1).
async function historyMenu(dir) {
  const h = tabs.hist[tabs.active]
  if (!h) return
  const steps = dir < 0 ? [...h.back].reverse() : h.fwd
  if (!steps.length) return
  const name = (p) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '')
  const choice = await api.menu(steps.map((st, k) => ({ id: String(k + 1), label: name(st.path), enabled: Boolean(findEntry(view.tree, st.path)) })))
  if (choice) goHistory(dir * Number(choice))
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
  tabs.hist.splice(i, 1)
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
  // Each tab keeps its history, its steps remapped too (a step whose file is
  // gone stays, and is skipped when reached).
  const remapSteps = (steps) => steps.map((st) => ({ ...st, path: map(st.path) ?? st.path }))
  const pairs = tabs.list
    .map((p, i) => [map(p), tabs.hist[i] ?? newHistory()])
    .filter(([p], k, all) => p && all.findIndex(([q]) => q === p) === k)
  tabs.list = pairs.map(([p]) => p)
  tabs.hist = pairs.map(([, h]) => ({ back: remapSteps(h.back), fwd: remapSteps(h.fwd) }))
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
  const hist = tabs.hist.map((h) => ({ back: h.back.slice(-HISTORY_LIMIT), fwd: h.fwd.slice(0, HISTORY_LIMIT) }))
  saveTabsTimer = setTimeout(() => api.setTabs({ list: tabs.list, active: tabs.active, hist }).catch(() => {}), 300)
}
async function restoreTabs() {
  restoringTabs = true
  try {
    const saved = await api.getTabs()
    const kept = saved.list.map((p, i) => [p, saved.hist?.[i] ?? newHistory()]).filter(([p]) => findEntry(view.tree, p))
    const list = kept.map(([p]) => p)
    const activePath = saved.list[saved.active]
    tabs.list = list
    tabs.hist = kept.map(([, h]) => h)
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
    tabs.hist = []
    tabs.active = -1
  } finally {
    restoringTabs = false
  }
  renderTabs()
}

function renderTabs() {
  saveTabs()
  drawHistoryButtons()
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
          { type: 'separator' },
          { id: 'tree', label: 'Reveal in file tree' },
          { id: 'reveal', label: REVEAL_LABEL },
        ])
        if (choice === 'close') closeTab(i)
        if (choice === 'tree') revealInTree(tabs.list[i])
        if (choice === 'reveal') api.showPath(tabs.list[i]).catch((err) => showError($('pane-error'), err))
        if (choice === 'others') {
          const keep = tabs.list[i]
          tabs.hist = [tabs.hist[i]]
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
    typedSinceRender = true
    schedulePreview({ incremental: true })
  },
  onScroll: syncScroll,
  // What link and tag completion reads (R4.1); the open note from the editor.
  vault: {
    files: () => files(),
    current: () => current,
    readNote: (path) => (path === current ? Promise.resolve(editor.text()) : api.readNote(path)),
    tags: () => api.tags(),
  },
  // A pasted image is written to the attachment folder and embedded at the
  // cursor (R2.7), as a dropped file is.
  onPasteImage: async (file) => {
    if (readOnly) return
    const note = current
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' }[file.type]
    if (!ext || notes.get(note)?.kind !== 'note') return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const rel = await run(() => api.pasteImage(ext, bytes))
    if (!rel || current !== note) return
    await refreshTree()
    editor.paste(linkFor(rel))
  },
  // Cmd/Ctrl+click on a link in the source follows it as the preview does.
  onFollowLink: (link) => follow(link),
})

// The source editor's right-click menu: spelling suggestions on a misspelt
// word, Follow link on a link, then Cut, Copy, Paste and Select all. The main
// process sends the spelling checker's findings with the click's point.
api.onEditMenu(async ({ x, y, misspelled, suggestions = [] }) => {
  if (!editor.view.dom.contains(document.elementFromPoint(x, y))) return
  const here = editor.contextAt(x, y)
  const items = []
  if (misspelled) {
    if (suggestions.length) items.push(...suggestions.slice(0, 6).map((word, k) => ({ id: `spell:${k}`, label: word })))
    else items.push({ id: 'none', label: 'No suggestions', enabled: false })
    items.push({ id: 'learn', label: 'Add to dictionary' }, { type: 'separator' })
  }
  if (here.link) items.push({ id: 'follow', label: 'Follow link' }, { id: 'follow-tab', label: 'Open link in new tab' }, { type: 'separator' })
  items.push(
    { id: 'cut', label: 'Cut', enabled: here.selection },
    { id: 'copy', label: 'Copy', enabled: here.selection },
    { id: 'paste', label: 'Paste' },
    { type: 'separator' },
    { id: 'select-all', label: 'Select all' },
  )
  const choice = await api.menu(items)
  if (!choice) return
  editor.focus()
  if (choice.startsWith('spell:')) {
    const word = suggestions[Number(choice.slice(6))]
    if (here.pos === null || !editor.replaceWord(here.pos, misspelled, word)) api.replaceMisspelling(word)
  }
  else if (choice === 'learn') api.addToDictionary(misspelled)
  else if (choice === 'follow' || choice === 'follow-tab') follow({ kind: here.link.kind, ref: here.link.ref, newTab: choice === 'follow-tab' })
  else if (choice === 'select-all') editor.selectAll()
  else if (['cut', 'copy', 'paste'].includes(choice)) api.editCommand(choice)
})

// ---- preview (R3.1): read-only rendering, alone or beside the editor ----
let assetBase = ''
// Whether the open folder is a read-only workspace (R2.8).
let readOnly = false
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
// A redraw after typing keeps the preview's unchanged blocks (item 14);
// any other (another note, a change in the vault's files that may resolve
// links differently, the theme, a reload from disk) draws it whole.
let drawnNote = null
function renderPreview({ incremental = false } = {}) {
  clearTimeout(previewTimer)
  previewIncremental = null
  if (!current) return
  if (notes.get(current)?.kind === 'base') {
    typedSinceRender = false
    drawnNote = null
    showBase(current)
    return
  }
  if (incremental && drawnNote === current) preview.update(editor.text(), $('preview'))
  else preview.render(editor.text(), $('preview'), { lines: true })
  drawnNote = current
  // The note's name heads it on paper (R3.9).
  $('print-title').textContent = printTitle(current)
  // The note's Properties stay as the reader left them while the note is
  // open; the split view redraws the preview on each edit.
  if (propertiesOpen !== current) propertiesOpen = null
  if (fullView.note !== current) exitDiagramFullScreen()
  if (propertiesOpen) $('preview').querySelector(':scope > details.properties')?.setAttribute('open', '')
  previewSettled = fillEmbeds()
  renderOutline()
  // The redraw keeps the preview's scroll offset, not its place in the note.
  if (noteMode === 'split' && driver === 'editor') previewFollowEditor()
  if (typedSinceRender && noteMode === 'split') keepCursorInPreview()
  typedSinceRender = false
  // A redraw replaces the preview's text, so open matches are found again.
  if (!$('preview-find').hidden) runPreviewFind({ keepPlace: true })
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
  // The heading by its source line (item 13); failing that, the preview's own
  // headings in order, leaving out embedded notes and the properties block.
  const stamped = $('preview').querySelector(`:is(h1, h2, h3, h4, h5, h6)[${LINE}="${line}"]`)
  const els = [...$('preview').querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((el) => !el.closest('.note-embed, .properties, .callout'))
  ;(stamped ?? els[k])?.scrollIntoView({ block: 'start' })
  if (editorShown()) editor.gotoLine(line)
}

// Resolves when the preview's embeds and diagrams are drawn.
let previewSettled = Promise.resolve()
async function fillEmbeds() {
  const note = current
  await fillNoteEmbeds($('preview'), 1, new Set([note]))
  if (current !== note) return
  const bases = fillBaseEmbeds()
  fillAttachmentEmbeds()
  await fillMermaid($('preview'))
  await bases
  // Embeds and diagrams change the preview's heights after it is drawn.
  if (current === note) scheduleFollow()
}

// Mermaid diagrams (R3.8): loaded only when a note has one; drawn with the
// strict security level, in the theme's colours; an invalid diagram shows
// its error in place of the drawing.
let mermaidLib = null
let mermaidSeq = 0
async function fillMermaid(host) {
  keepViewsFor(current)
  const blocks = [...host.querySelectorAll('pre.mermaid-src')]
  if (!blocks.length) return
  // Each diagram's key for its kept view (R3.8.1): the note it belongs to
  // (this one, or an embedded one) and its order there, counting the
  // diagrams a redraw kept (item 14) as well as those to draw.
  const counts = new Map()
  const keyOf = new Map()
  for (const el of host.querySelectorAll('pre.mermaid-src, .mermaid-diagram')) {
    const owner = el.closest('.note-embed')?.dataset.path ?? current
    const n = counts.get(owner) ?? 0
    counts.set(owner, n + 1)
    keyOf.set(el, `${owner}#${n}`)
  }
  const keys = blocks.map((pre) => keyOf.get(pre))
  if (!mermaidLib) mermaidLib = (await import('mermaid')).default
  for (const [i, pre] of blocks.entries()) {
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
    if (!pre.isConnected) continue
    if (pre.hasAttribute(LINE)) box.setAttribute(LINE, pre.getAttribute(LINE))
    preview.carryKey(pre, box)
    pre.replaceWith(box)
    const svg = box.querySelector(':scope > svg')
    if (svg) attachPanZoom(box, svg, { key: keys[i], onMenu: diagramMenu })
  }
}

// The right-click menu of a diagram in the preview.
async function diagramMenu(_e, controls) {
  const choice = await api.menu([
    { id: 'fit', label: 'Zoom to fit' },
    { id: 'full', label: 'Full screen' },
  ])
  if (choice === 'fit') controls.fit()
  if (choice === 'full') enterDiagramFullScreen(controls.svg)
}

// Full screen (R3.8.1): the window in the system's full-screen mode showing
// only one diagram, fitted, with the same pan and zoom. Escape, the menu,
// leaving the system's full screen, or another note leaves it, and the
// window returns to the state it was in.
// fill(host) draws the content into a fresh element filling the screen;
// removing that element on exit releases what it holds (an STL view's WebGL
// context included).
async function enterFullScreen(fill) {
  if (!$('diagram-full').hidden) return
  const host = document.createElement('div')
  host.className = 'full-host'
  $('diagram-full-frame').replaceChildren(host)
  $('diagram-full').hidden = false
  document.body.classList.add('full-view')
  fullView.note = current
  fill(host)
  fullView.wasFull = await api.setFullScreen(true)
}
function enterDiagramFullScreen(svg) {
  enterFullScreen((host) => {
    const copy = svg.cloneNode(true)
    copy.style.transform = ''
    host.append(copy)
    attachPanZoom(host, copy, { fillHeight: true, onMenu: fullScreenMenu })
  })
}
function exitDiagramFullScreen({ windowLeft = false } = {}) {
  if ($('diagram-full').hidden) return
  $('diagram-full').hidden = true
  document.body.classList.remove('full-view')
  $('diagram-full-frame').replaceChildren()
  if (!windowLeft && !fullView.wasFull) api.setFullScreen(false)
}
async function fullScreenMenu(_e, controls) {
  const choice = await api.menu([
    ...(controls?.fit ? [{ id: 'fit', label: 'Zoom to fit' }] : []),
    { id: 'exit', label: 'Exit full screen' },
  ])
  if (choice === 'fit') controls.fit()
  if (choice === 'exit') exitDiagramFullScreen()
}
// The right-click menu of an STL model, in the pane or a note (a right-click
// without a drag; a right-drag pans the model).
async function modelMenu(path, controls) {
  const choice = await api.menu([
    { id: 'fit', label: 'Zoom to fit' },
    { id: 'full', label: 'Full screen' },
  ])
  if (choice === 'fit') controls.fit()
  if (choice === 'full') enterFullScreen((host) => mountModel(host, { path, api, onMenu: (_p, c) => fullScreenMenu(null, c) }))
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('diagram-full').hidden) {
    e.preventDefault()
    exitDiagramFullScreen()
  }
})
api.onLeftFullScreen(() => exitDiagramFullScreen({ windowLeft: true }))
api.onEscape(() => exitDiagramFullScreen())

// An HTML attachment's right-click (R3.8.1), passed on by the main process
// with the frame's address: Full screen shows a fresh copy of the page, in the
// same sandbox; inside full screen the menu offers Exit full screen.
api.onFrameMenu(async (url) => {
  if (!$('diagram-full').hidden) return fullScreenMenu(null, null)
  const choice = await api.menu([{ id: 'full', label: 'Full screen' }])
  if (choice !== 'full') return
  enterFullScreen((host) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals')
    frame.src = url
    frame.className = 'full-page'
    host.append(frame)
  })
})

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
  for (const el of $('preview').querySelectorAll('.attachment-embed:not([data-filled])')) {
    el.dataset.filled = '1'
    renderAttachment(el, { path: el.dataset.path, url: assetUrlOf(el.dataset.path), api, embedded: true, onModelMenu: modelMenu })
  }
}

// Whether the pending redraw may keep unchanged blocks: only if every
// request since the last redraw came from typing.
let previewIncremental = null
function schedulePreview({ incremental = false } = {}) {
  clearTimeout(previewTimer)
  if (notes.get(current)?.kind === 'base') return
  previewIncremental = (previewIncremental ?? true) && incremental
  previewTimer = setTimeout(() => renderPreview({ incremental: previewIncremental }), 120)
}

// ---- find in the open note (R4.7): Cmd/Ctrl+F opens CodeMirror's panel when
// the editor has the focus, and otherwise a bar that finds in the preview's
// rendered text, the matches marked with CSS highlights so that the preview's
// DOM is never changed. Cmd/Ctrl+Shift+F puts the cursor in the vault search
// box (R5.1). ----
const finding = { ranges: [], at: -1 }

function showPreviewMatches() {
  const all = finding.ranges
  const current = all[finding.at]
  if (globalThis.CSS?.highlights && globalThis.Highlight) {
    CSS.highlights.set('scrinotia-find', new Highlight(...all.filter((r) => r !== current)))
    if (current) CSS.highlights.set('scrinotia-find-current', new Highlight(current))
    else CSS.highlights.delete('scrinotia-find-current')
  }
  $('find-count').textContent = $('find-input').value ? (all.length ? `${finding.at + 1} of ${all.length}` : 'No matches') : ''
  const el = current?.startContainer?.parentElement
  if (el) {
    const box = current.getBoundingClientRect()
    const pv = $('preview').getBoundingClientRect()
    if (box.top < pv.top || box.bottom > pv.bottom) el.scrollIntoView({ block: 'center' })
  }
}

function runPreviewFind({ keepPlace = false } = {}) {
  const was = finding.at
  finding.ranges = findMatches($('preview'), $('find-input').value, { caseSensitive: $('find-case').checked })
  finding.at = finding.ranges.length ? (keepPlace ? Math.min(Math.max(was, 0), finding.ranges.length - 1) : 0) : -1
  showPreviewMatches()
}

function stepPreviewFind(by) {
  if (!finding.ranges.length) return
  finding.at = (finding.at + by + finding.ranges.length) % finding.ranges.length
  showPreviewMatches()
}

function openPreviewFind() {
  const picked = String(document.getSelection() ?? '').trim()
  if (picked && !picked.includes('\n')) $('find-input').value = picked
  $('preview-find').hidden = false
  $('find-input').focus()
  $('find-input').select()
  runPreviewFind()
}

function closePreviewFind() {
  $('preview-find').hidden = true
  finding.ranges = []
  finding.at = -1
  globalThis.CSS?.highlights?.delete('scrinotia-find')
  globalThis.CSS?.highlights?.delete('scrinotia-find-current')
}

$('find-input').addEventListener('input', () => runPreviewFind())
$('find-case').addEventListener('change', () => runPreviewFind())
$('find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    stepPreviewFind(e.shiftKey ? -1 : 1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closePreviewFind()
  }
})
$('find-next').addEventListener('click', () => stepPreviewFind(1))
$('find-prev').addEventListener('click', () => stepPreviewFind(-1))
$('find-close').addEventListener('click', closePreviewFind)

api.onFind(() => {
  if ($('workspace').hidden || $('note-area').hidden) return
  if (noteMode === 'source' || (noteMode === 'split' && $('editor').contains(document.activeElement))) {
    closePreviewFind()
    editor.openFind()
  } else {
    openPreviewFind()
  }
})
api.onFindVault(() => {
  if ($('workspace').hidden) return
  $('show-files').click()
  if (!layout.leftOpen) toggleDrawer('left')
  $('search').focus()
  $('search').select()
})

// ---- scroll sync (item 13): in split mode the editor and the preview show
// the same place in the note, matched by source line. The preview's blocks
// carry their first lines; the editor's top line finds its place between
// two of them, and the reverse when the preview is scrolled. The pane the
// reader last used (wheel, pointer, key or touch) leads, so that a scroll
// set by the other is not followed back. Whilst typing, the block holding
// the cursor is kept in view in the preview.
let driver = 'editor'
let typedSinceRender = false
for (const pane of ['editor', 'preview']) {
  for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) {
    $(pane).addEventListener(type, () => (driver = pane), { capture: true, passive: true })
  }
}

// The preview's stamped blocks as anchors: a source line and the block's
// height in the preview's scrolled content. Blocks inside a closed
// <details> have no place of their own and are left out. A base's preview
// has no stamps: there, and in an empty note, the anchors are null and the
// panes follow each other by proportion.
function previewAnchors() {
  const pv = $('preview')
  const base = pv.getBoundingClientRect().top - pv.scrollTop
  const anchors = []
  for (const el of pv.querySelectorAll(`[${LINE}]`)) {
    if (el.parentElement?.closest('details:not([open])')) continue
    anchors.push({ line: Number(el.getAttribute(LINE)), top: el.getBoundingClientRect().top - base })
  }
  if (!anchors.length) return null
  if (anchors[0].line > 1) anchors.unshift({ line: 1, top: 0 })
  return orderedAnchors(anchors)
}

// The editor's top line, with the fraction of it scrolled past.
function editorTopLine() {
  const v = editor.view
  const h = Math.max(0, v.scrollDOM.getBoundingClientRect().top - v.documentTop)
  const block = v.lineBlockAtHeight(h)
  const fraction = block.height > 0 ? Math.min(1, Math.max(0, (h - block.top) / block.height)) : 0
  return v.state.doc.lineAt(block.from).number + fraction
}

const atTop = (el) => el.scrollTop <= 0
const atBottom = (el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1
const byProportion = (src, dst) => {
  const max = src.scrollHeight - src.clientHeight
  dst.scrollTop = max > 0 ? (src.scrollTop / max) * (dst.scrollHeight - dst.clientHeight) : 0
}

function previewFollowEditor() {
  if (noteMode !== 'split' || !current) return
  const src = editor.view.scrollDOM
  const dst = $('preview')
  const anchors = previewAnchors()
  if (!anchors) byProportion(src, dst)
  else if (atTop(src)) dst.scrollTop = 0
  else if (atBottom(src)) dst.scrollTop = dst.scrollHeight
  else dst.scrollTop = Math.round(topForLine(anchors, editorTopLine()))
}

function editorFollowPreview() {
  if (noteMode !== 'split' || !current) return
  const src = $('preview')
  const v = editor.view
  const anchors = previewAnchors()
  if (!anchors) byProportion(src, v.scrollDOM)
  else if (atTop(src)) v.scrollDOM.scrollTop = 0
  else if (atBottom(src)) v.scrollDOM.scrollTop = v.scrollDOM.scrollHeight
  else scrollEditorToLine(lineForTop(anchors, src.scrollTop))
}

// Puts a (fractional) line at the top of the editor.
function scrollEditorToLine(at) {
  const v = editor.view
  const n = Math.max(1, Math.min(Math.floor(at), v.state.doc.lines))
  const line = v.state.doc.line(n)
  // CodeMirror measures the line before scrolling, so a line far from the
  // drawn part lands where it should; the margin scrolls past the fraction.
  const yMargin = -(at - n) * v.lineBlockAt(line.from).height
  v.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin }) })
}

// Scroll events come many to a frame; one follow per frame is enough.
let followFrame = 0
function scheduleFollow(from = driver) {
  cancelAnimationFrame(followFrame)
  followFrame = requestAnimationFrame(() => (from === 'editor' ? previewFollowEditor() : editorFollowPreview()))
}

function syncScroll() {
  if (noteMode === 'split' && driver === 'editor') scheduleFollow('editor')
}
$('preview').addEventListener('scroll', () => {
  if (noteMode === 'split' && driver === 'preview') scheduleFollow('preview')
})
// An image that loads late changes the heights below it.
$('preview').addEventListener('load', () => noteMode === 'split' && scheduleFollow(), true)

// Aligns the panes (one of the follow functions) once the editor has
// measured itself, after a note is shown or the mode changed. The last
// request wins, so Back and Forward, which restore the preview's place,
// override the editor's own.
let alignFrom = null
function alignSoon(align) {
  alignFrom = align
  // Dispatching inside CodeMirror's measure is not allowed, hence the microtask.
  editor.view.requestMeasure({
    read: () => null,
    write: () =>
      queueMicrotask(() => {
        const align = alignFrom
        alignFrom = null
        align?.()
      }),
  })
}

// The preview block that holds the cursor's line: the last stamped block
// (a list item before its list) starting at or above it.
function cursorBlock() {
  const v = editor.view
  const line = v.state.doc.lineAt(v.state.selection.main.head).number
  let best = null
  for (const el of $('preview').querySelectorAll(`[${LINE}]`)) {
    if (Number(el.getAttribute(LINE)) <= line) best = el
  }
  return best
}

function keepCursorInPreview() {
  const el = cursorBlock()
  if (!el || el.parentElement?.closest('details:not([open])')) return
  const pv = $('preview').getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.bottom > pv.bottom) $('preview').scrollTop += Math.min(r.bottom - pv.bottom, r.top - pv.top)
  else if (r.top < pv.top) $('preview').scrollTop -= pv.top - r.top
}

// A task box in the preview flips its item's `[ ]` or `[x]` in the source
// (item 5, R3.2), in either mode, as an edit of the reader's: it saves,
// undoes in the editor, and the preview is redrawn from the result.
$('preview').addEventListener('click', (e) => {
  const box = e.target.closest?.('input.task-box')
  if (!box || !current || notes.get(current)?.kind !== 'note') return
  e.preventDefault()
  if (readOnly) return
  const v = editor.view
  const n = Number(box.closest('li')?.getAttribute(LINE))
  if (!(n >= 1 && n <= v.state.doc.lines)) return
  const line = v.state.doc.line(n)
  const toggle = taskToggle(line.text)
  if (!toggle) return
  const at = line.from + toggle.offset
  v.dispatch({ changes: { from: at, to: at + 1, insert: toggle.insert }, userEvent: 'input.toggle' })
  renderPreview({ incremental: true })
})

// A click in the preview, in split mode, puts the editor's cursor at the
// start of the block's source; links, controls, diagrams and selections are
// left to their own handling.
$('preview').addEventListener('click', (e) => {
  if (noteMode !== 'split' || e.button !== 0 || !current) return
  if (!document.getSelection()?.isCollapsed) return
  if (e.target.closest('a, button, input, select, textarea, summary, video, audio, iframe, .mermaid-diagram, .base-embed, .attachment-embed')) return
  const el = e.target.closest(`[${LINE}]`)
  if (!el) return
  const v = editor.view
  const line = v.state.doc.line(Math.max(1, Math.min(Number(el.getAttribute(LINE)), v.state.doc.lines)))
  v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'nearest' }) })
  editor.focus()
})

const editorShown = () => noteMode !== 'preview'

// A change of mode keeps the reader's place: the line at the top of the
// preview, or of the editor when the source was shown alone. The preview
// reflows at its new width, so its place is found again by that line.
function setNoteMode(mode) {
  const from = noteMode
  const visible = current && !$('note-area').hidden
  const before = visible && from !== 'source' ? previewAnchors() : null
  const shown = before ? lineForTop(before, $('preview').scrollTop) : visible && from === 'source' ? editorTopLine() : null
  noteMode = mode
  $('note-area').className = `note-area mode-${mode}`
  for (const m of NOTE_MODES) $(`mode-${m}`).classList.toggle('active', m === mode)
  const after = shown !== null && mode !== 'source' ? previewAnchors() : null
  if (after) $('preview').scrollTop = Math.round(topForLine(after, shown))
  if (mode !== 'preview') {
    editor.view.requestMeasure()
    editor.focus()
    if (from === 'preview' && mode === 'split') alignSoon(editorFollowPreview)
    else if (from === 'preview' && shown !== null) alignSoon(() => scrollEditorToLine(shown))
    else if (from === 'source' && mode === 'split') alignSoon(previewFollowEditor)
  }
}

api.onCycleMode(() => {
  if ($('modes').hidden) return
  setNoteMode(nextMode(noteMode))
})

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

// Each system's own name for showing a file in its file manager.
const REVEAL_LABEL = { darwin: 'Reveal in Finder', win32: 'Show in File Explorer' }[api.platform] ?? 'Open containing folder'

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

// The editor's scroll is kept with the note (item 16) only whilst the
// editor is shown: a hidden editor has no scroll position of its own.
function rememberCurrent() {
  if (!current || !notes.has(current)) return
  const entry = notes.get(current)
  entry.state = editor.getState()
  if (editorShown()) entry.scroll = editor.view.scrollSnapshot()
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
  for (const el of $('preview').querySelectorAll('.base-embed:not([data-filled])')) {
    el.dataset.filled = '1'
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
    await renderAttachment($('preview'), { path, url: assetUrlOf(path), api, onModelMenu: modelMenu })
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
  // A note left with unsaved edits may have changed on disk whilst hidden
  // (item 18): compare before its next save can overwrite the change.
  const disk = entry.dirty ? await api.readNote(path).catch(() => null) : null
  if (current !== path) return // another note was chosen while this one loaded
  $('note-area').hidden = false
  $('modes').hidden = false
  editor.setState(entry.state)
  // The editor's kept place leads; a scroll event from the preview's redraw
  // must not move it.
  driver = 'editor'
  if (editorShown()) {
    const head = entry.state.selection.main.head
    editor.view.dispatch({ effects: entry.scroll ?? EditorView.scrollIntoView(head, { y: 'center' }) })
  }
  const conflict = diskConflict(entry, disk)
  if (conflict !== null) {
    conflictText = conflict
    $('conflict').hidden = false
  }
  renderPreview()
  updateResolver()
  alignSoon(previewFollowEditor)
}

async function renderPane() {
  if (fullView.note !== current) exitDiagramFullScreen()
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
for (const mode of NOTE_MODES) $(`mode-${mode}`).addEventListener('click', () => setNoteMode(mode))

// Shows a vault entry in the file tree: the Files list and the left panel
// opened if need be, its folders expanded, the entry selected and scrolled
// into view. The note pane is left as it is.
function revealInTree(path) {
  if (!path) return
  view.selected = { path, type: findEntry(view.tree, path)?.type ?? 'note' }
  let folder = parentOf(path)
  while (folder) {
    view.expanded.add(folder)
    folder = parentOf(folder)
  }
  $('show-files').click()
  if (!layout.leftOpen) toggleDrawer('left')
  renderTree()
  document.querySelector(`#tree li[data-path="${CSS.escape(path)}"] > .row`)?.scrollIntoView({ block: 'center' })
}

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
  if (readOnly) {
    showError($('pane-error'), `“${target}” does not exist.`)
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
  if (!sel || readOnly) return
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
// The split view's divider (item 15) sets the editor's share of the note
// area, also remembered on this machine (R6.5).
const layout = { leftOpen: true, rightOpen: true, leftWidth: DEFAULT_WIDTH, rightWidth: DEFAULT_WIDTH, editorShare: DEFAULT_SHARE }
let saveLayoutTimer = null

function applyLayout() {
  const ws = $('workspace')
  ws.style.setProperty('--left-width', `${layout.leftWidth}px`)
  ws.style.setProperty('--right-width', `${layout.rightWidth}px`)
  ws.classList.toggle('left-closed', !layout.leftOpen)
  ws.classList.toggle('right-closed', !layout.rightOpen)
  $('toggle-left').classList.toggle('closed', !layout.leftOpen)
  $('toggle-right').classList.toggle('closed', !layout.rightOpen)
  $('note-area').style.setProperty('--editor-share', `${(layout.editorShare * 100).toFixed(2)}%`)
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
    // The drag ends however the pointer is let go: released, cancelled, its
    // capture lost (as when it is released outside the window), or moved
    // with no button held; otherwise the panel would follow the pointer
    // whenever it next crossed the splitter.
    const move = (ev) => {
      if (ev.buttons === 0) return end()
      const w = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX
      layout[side === 'left' ? 'leftWidth' : 'rightWidth'] = clampWidth(side, w)
      applyLayout()
    }
    const end = () => {
      bar.classList.remove('dragging')
      $('workspace').classList.remove('resizing')
      bar.removeEventListener('pointermove', move)
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.removeEventListener(type, end)
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId)
      saveLayout()
    }
    bar.addEventListener('pointermove', move)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.addEventListener(type, end)
  })
  bar.addEventListener('dblclick', () => {
    layout[side === 'left' ? 'leftWidth' : 'rightWidth'] = DEFAULT_WIDTH
    applyLayout()
    saveLayout()
  })
}

// The share is a fraction, so it holds as the window or the drawers change.
function dragNoteSplitter() {
  const bar = $('split-note')
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    bar.setPointerCapture(e.pointerId)
    bar.classList.add('dragging')
    $('workspace').classList.add('resizing')
    const move = (ev) => {
      if (ev.buttons === 0) return end()
      const area = $('note-area').getBoundingClientRect()
      layout.editorShare = Math.round(clampShare((ev.clientX - area.left) / area.width, area.width) * 1000) / 1000
      applyLayout()
      scheduleFollow()
    }
    const end = () => {
      bar.classList.remove('dragging')
      $('workspace').classList.remove('resizing')
      bar.removeEventListener('pointermove', move)
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.removeEventListener(type, end)
      if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId)
      saveLayout()
    }
    bar.addEventListener('pointermove', move)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) bar.addEventListener(type, end)
  })
  bar.addEventListener('dblclick', () => {
    layout.editorShare = DEFAULT_SHARE
    applyLayout()
    saveLayout()
    scheduleFollow()
  })
}

$('toggle-left').addEventListener('click', () => toggleDrawer('left'))
$('toggle-right').addEventListener('click', () => toggleDrawer('right'))
api.onToggleDrawer(toggleDrawer)
dragSplitter('left')
dragSplitter('right')
dragNoteSplitter()
api
  .getLayout()
  .then((saved) => {
    if (typeof saved.leftOpen === 'boolean') layout.leftOpen = saved.leftOpen
    if (typeof saved.rightOpen === 'boolean') layout.rightOpen = saved.rightOpen
    if (Number.isFinite(saved.leftWidth)) layout.leftWidth = Math.max(160, Math.min(600, saved.leftWidth))
    if (Number.isFinite(saved.rightWidth)) layout.rightWidth = Math.max(160, Math.min(600, saved.rightWidth))
    if (Number.isFinite(saved.editorShare)) layout.editorShare = Math.max(0.1, Math.min(0.9, saved.editorShare))
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
  li.addEventListener('dragstart', (e) => e.dataTransfer.setData(PATH_TYPE, path))
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

// A folder from the tree is refused (R2.7): the drop effect is set to none,
// even over the editor's editable text, so the pointer shows that nothing can
// be dropped and no drop event follows.
function canDrop(e) {
  return !readOnly && current && notes.get(current)?.kind === 'note' && noteAccepts(e.dataTransfer?.types)
}

$('note-area').addEventListener(
  'dragover',
  (e) => {
    if (e.dataTransfer?.types.includes(FOLDER_TYPE)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'none'
      return
    }
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
    const inEditor = editorShown() && $('editor').contains(e.target)
    const pos = inEditor ? editor.posAt(e.clientX, e.clientY) : null
    const paths = []
    const vaultPath = e.dataTransfer.getData(PATH_TYPE)
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
  // The echo of our own save changes nothing that the preview shows, so
  // only another change redraws it (item 14: the echo had doubled the
  // redraws whilst typing).
  let changed = false
  for (const path of paths) {
    const entry = notes.get(path)
    changed ||= !entry
    if (!entry) continue
    let disk
    try {
      disk = await api.readNote(path)
    } catch {
      changed = true
      forgetNotes((p) => p === path) // deleted or moved away
      continue
    }
    if (disk === entry.disk) continue // our own save, or no change
    changed = true
    if (path !== current) {
      if (entry.dirty) continue // checked when the note is next shown (showNote)
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
  if (changed) updateResolver()
  if (currentBase) showBase(currentBase)
  else if (!current) renderPane()
  else renderLinks()
  if ($('search').value.trim()) runSearch()
  if (sidePane === 'tags') renderTags()
})

$('version').textContent = `version ${api.version}`
renderRecent()
