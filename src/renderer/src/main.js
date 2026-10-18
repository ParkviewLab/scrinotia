// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The vault browser: a start screen with recent vaults, then a file tree and a
// note pane. The note pane is read-only until the editor lands.

const api = window.granite
const $ = (id) => document.getElementById(id)

const view = {
  tree: [],
  selected: null, // { path, type }
  openNote: null, // path of the note shown in the pane
  expanded: new Set(),
  renaming: false, // an inline rename input is open; do not redraw the tree under it
}

// ---- theme (R6.2): dark by default, held for the session ----
const themeSelect = $('theme')
themeSelect.addEventListener('change', () => {
  document.documentElement.dataset.theme = themeSelect.value
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
    view.tree = opened.tree
    view.selected = null
    view.openNote = null
    view.expanded = new Set()
    $('vault-name').textContent = opened.name
    $('vault-name').title = opened.root
    $('start').hidden = true
    $('workspace').hidden = false
    renderTree()
    renderPane()
  } catch (err) {
    showError($('start-error'), err)
  }
}

$('open-folder').addEventListener('click', () => enterVault(api.chooseVault))
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

// ---- pane ----
async function renderPane() {
  const body = $('note-body')
  showError($('pane-error'), null)
  $('entry-actions').hidden = !view.selected
  $('note-path').textContent = view.selected?.path ?? ''
  if (!view.openNote) {
    body.textContent = ''
    return
  }
  const entry = findEntry(view.tree, view.openNote)
  if (entry?.type === 'attachment') {
    body.textContent = `${entry.name} is an attachment; it is not shown in this version.`
    return
  }
  try {
    body.textContent = await api.readNote(view.openNote)
  } catch (err) {
    body.textContent = ''
    showError($('pane-error'), err)
  }
}

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
  const done = await run(() => api.move(from, to))
  if (!done) return
  const remap = (p) => (p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p)
  if (view.selected) view.selected.path = remap(view.selected.path)
  if (view.openNote) view.openNote = remap(view.openNote)
  view.expanded = new Set([...view.expanded].map(remap))
  view.expanded.add(parentOf(to))
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
  const done = await run(async () => {
    await api.trash(sel.path)
    return true
  })
  if (!done) return
  view.selected = null
  if (view.openNote === sel.path || view.openNote?.startsWith(sel.path + '/')) view.openNote = null
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
  if (view.openNote === null || paths.includes(view.openNote)) renderPane()
})

$('version').textContent = `version ${api.version}`
renderRecent()
