// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault browser and editor: a start screen with recent vaults, then a
// file tree and the note editor.

import { createEditor } from './editor/editor.js'
import { createPreview } from './preview.js'
import { renderCell } from './baseCells.js'
import { splitLink } from '../../shared/markdown.js'
import { resolveLink, resolveRelative, flattenFiles } from '../../shared/links.js'

const api = window.granite
const $ = (id) => document.getElementById(id)

const view = {
  tree: [],
  selected: null, // { path, type }
  openNote: null, // path of the note shown in the pane
  expanded: new Set(),
  renaming: false, // an inline rename input is open; do not redraw the tree under it
}

// ---- theme (R6.2): dark by default; kept per vault in .granite-vaulting/ (R6.4) ----
const themeSelect = $('theme')
function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = t
  themeSelect.value = t
}
themeSelect.addEventListener('change', async () => {
  applyTheme(themeSelect.value)
  try {
    await api.setSettings('appearance', { theme: themeSelect.value })
  } catch (err) {
    showError($('pane-error'), err)
  }
})

async function loadVaultSettings() {
  try {
    const { values, conflicts } = await api.getSettings('appearance')
    applyTheme(values.theme)
    if (conflicts.length) {
      showError($('pane-error'), `Ignored a synchronisation conflict copy of the vault settings: ${conflicts.join(', ')}`)
    }
  } catch {
    applyTheme('dark')
  }
}

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
    renderTree()
    await renderPane()
    await loadVaultSettings()
  } catch (err) {
    showError($('start-error'), err)
  }
}

$('open-folder').addEventListener('click', () => enterVault(api.chooseVault))
$('new-window').addEventListener('click', () => api.newWindow())
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
  row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/x-gv-path', entry.path))
  row.addEventListener('click', () => select(entry))
  li.append(row)
  if (entry.type === 'folder') {
    if (view.expanded.has(entry.path)) li.classList.add('open')
    row.addEventListener('dragover', (e) => e.preventDefault())
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      moveInto(e.dataTransfer.getData('text/x-gv-path'), entry.path)
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
  moveInto(e.dataTransfer.getData('text/x-gv-path'), '')
})

async function moveInto(from, folder) {
  if (!from || parentOf(from) === folder) return
  if (folder === from || folder.startsWith(from + '/')) return
  const name = from.slice(from.lastIndexOf('/') + 1)
  await rename(from, join(folder, name))
}

function select(entry) {
  view.selected = { path: entry.path, type: entry.type }
  if (entry.type === 'folder') {
    if (view.expanded.has(entry.path)) view.expanded.delete(entry.path)
    else view.expanded.add(entry.path)
  } else {
    view.openNote = entry.path
  }
  renderTree()
  renderPane()
}

async function refreshTree() {
  view.tree = await api.tree()
  if (view.renaming) return
  if (view.selected && !findEntry(view.tree, view.selected.path)) view.selected = null
  if (view.openNote && !findEntry(view.tree, view.openNote)) view.openNote = null
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
})

function renderPreview() {
  clearTimeout(previewTimer)
  if (!current) return
  preview.render(editor.text(), $('preview'))
}

function schedulePreview() {
  clearTimeout(previewTimer)
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

$('preview').addEventListener('click', (e) => {
  const el = e.target.closest('[data-wikilink], [data-href]')
  if (!el) return
  e.preventDefault()
  const wikilink = el.getAttribute('data-wikilink')
  if (wikilink !== null) follow({ kind: 'wikilink', ref: wikilink })
  else follow({ kind: 'href', ref: el.getAttribute('data-href') })
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
  const host = $('preview')
  host.replaceChildren()
  if (out.error) {
    const p = document.createElement('p')
    p.className = 'missing'
    p.textContent = out.error
    host.append(p)
    return
  }
  baseView = Math.min(baseView, Math.max(out.views.length - 1, 0))
  const tabs = document.createElement('div')
  tabs.className = 'base-tabs'
  out.views.forEach((v, n) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = v.name
    b.classList.toggle('active', n === baseView)
    b.addEventListener('click', () => {
      baseView = n
      showBase(path)
    })
    tabs.append(b)
  })
  host.append(tabs)
  const v = out.views[baseView]
  if (!v) return
  if (v.error) {
    const p = document.createElement('p')
    p.className = 'missing'
    p.textContent = v.error
    host.append(p)
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
  const openTarget = (cell) => {
    if (cell.path) openPath(cell.path)
    else if (cell.target) follow({ kind: 'wikilink', ref: cell.target })
  }
  const assetUrl = (p) => assetBase + p.split('/').map(encodeURIComponent).join('/')
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
  const notices = [...(out.notices ?? []), ...(v.notices ?? [])]
  for (const n of notices) {
    const p = document.createElement('p')
    p.className = 'notice'
    p.textContent = n
    host.append(p)
  }
  const count = document.createElement('p')
  count.className = 'muted'
  count.textContent = `${v.rows.length} ${v.rows.length === 1 ? 'entry' : 'entries'}`
  host.append(table, count)
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
  if (entryInfo?.type === 'base') {
    current = null
    body.textContent = ''
    $('modes').hidden = true
    setNoteMode('preview')
    $('note-area').hidden = false
    await showBase(path)
    return
  }
  if (!path || entryInfo?.type !== 'note') {
    $('note-area').hidden = true
    $('modes').hidden = true
    body.textContent = entryInfo ? `${entryInfo.name} is an attachment; it is not shown in this version.` : ''
    current = null
    return
  }
  body.textContent = ''
  let entry = notes.get(path)
  if (!entry) {
    try {
      const text = await api.readNote(path)
      entry = { state: editor.createState(text), disk: text, dirty: false, timer: null }
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
  if (onClick) li.addEventListener('click', onClick)
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
    fillList('backlinks', back.map((b) => hitItem(b.source.replace(/\.md$/i, ''), b.context, () => openPath(b.source))))
    fillList('unlinked', unlinked.map((m) => hitItem(m.source.replace(/\.md$/i, ''), m.context, () => openPath(m.source))))
    fillList(
      'outgoing',
      out.map((o) =>
        o.resolved
          ? hitItem(o.text, o.resolved, () => openPath(o.resolved))
          : hitItem(o.text, 'not found', () => follow({ kind: 'wikilink', ref: o.target }), 'unresolved'),
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
  const q = $('search').value.trim()
  const seq = ++searchSeq
  if (!q) {
    $('results').hidden = true
    $('tree').hidden = false
    return
  }
  let results = []
  try {
    results = await api.search(q)
  } catch (err) {
    showError($('pane-error'), err)
  }
  if (seq !== searchSeq) return
  $('tree').hidden = true
  $('results').hidden = false
  const items = results.map((r) =>
    hitItem(
      r.path.replace(/\.md$/i, ''),
      r.matches.map((m) => m.context).join(' · '),
      () => openPath(r.path),
    ),
  )
  if (items.length === 0) {
    const li = document.createElement('li')
    li.className = 'info'
    li.textContent = 'No matches.'
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
async function openPath(path) {
  view.selected = { path, type: findEntry(view.tree, path)?.type ?? 'note' }
  view.openNote = path
  let folder = parentOf(path)
  while (folder) {
    view.expanded.add(folder)
    folder = parentOf(folder)
  }
  renderTree()
  await renderPane()
}

async function follow({ kind, ref }) {
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
    if (hit) await openPath(hit)
    else showError($('pane-error'), `No note at ${decoded}`)
    return
  }
  const { target } = splitLink(ref)
  if (!target) return
  const hit = resolveLink(target, current, files())
  if (hit) {
    await openPath(hit)
    return
  }
  if (!window.confirm(`“${target}” does not exist. Create it?`)) return
  const name = target.split('/').pop()
  const rel = await run(() => api.createNote(parentOf(target), name))
  if (!rel) return
  await refreshTree()
  await openPath(rel)
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
  if (view.openNote) view.openNote = remap(view.openNote)
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
  view.openNote = rel
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
  if (view.openNote === sel.path || view.openNote?.startsWith(sel.path + '/')) view.openNote = null
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
})

$('version').textContent = `version ${api.version}`
renderRecent()
