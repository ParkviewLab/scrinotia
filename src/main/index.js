// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The main process. Each window holds at most one vault, with its own watcher
// and link index (R2.1); a vault already open in one window is focused rather
// than opened twice. All filesystem access happens here.

import { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } from 'electron'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, basename, sep, resolve } from 'node:path'
import * as vault from './vault.js'
import { createState } from './state.js'
import { createIndex } from './linkIndex.js'
import { renderBase } from './bases.js'
import { readSettings, writeSettings } from './vaultSettings.js'
import { openAboutWindow, openLicensesWindow } from './about.js'
import appIcon from '../../build/icon.png?asset'

const state = createState(app.getPath('userData'))
const contexts = new Map() // webContents id -> { win, root, watcher, index, flushed }
let quitting = false

// Embedded images are served to the preview as gv-asset://<window token>/<path>,
// resolved inside that window's vault only.
protocol.registerSchemesAsPrivileged([{ scheme: 'gv-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

function serveAssets() {
  protocol.handle('gv-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const ctx = [...contexts.values()].find((c) => c.token === url.hostname)
      if (!ctx?.root) return new Response('not found', { status: 404 })
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      // Range headers pass through, so audio and video can seek.
      return net.fetch(pathToFileURL(vault.resolveInside(ctx.root, rel)).toString(), { headers: request.headers })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

function flatten(tree) {
  return tree.flatMap((e) => (e.children ? flatten(e.children) : [e.path]))
}

function ctxOf(event) {
  const ctx = contexts.get(event.sender.id)
  if (!ctx) throw new Error('unknown window')
  return ctx
}

function rootOf(event) {
  const ctx = ctxOf(event)
  if (!ctx.root) throw new Error('no vault is open in this window')
  return ctx.root
}

// External changes (R1.5): a recursive watch, debounced; the index is brought
// up to date before the window is told which vault-relative paths changed.
function startWatching(ctx) {
  ctx.watcher?.close()
  let pending = new Set()
  let timer = null
  const root = ctx.root
  ctx.watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const rel = filename.split(sep).join('/')
    if (rel.split('/').some(vault.isHidden)) return
    pending.add(rel)
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const paths = [...pending]
      pending = new Set()
      if (ctx.root !== root) return
      await ctx.index.update(paths)
      if (!ctx.win.isDestroyed()) ctx.win.webContents.send('vault:changed', paths)
    }, 150)
  })
}

async function openVault(ctx, dir) {
  const full = resolve(dir)
  for (const other of contexts.values()) {
    if (other !== ctx && other.root === full) {
      other.win.show()
      other.win.focus()
      return { elsewhere: true, name: basename(full) }
    }
  }
  const info = await stat(full)
  if (!info.isDirectory()) throw new Error(`not a folder: ${full}`)
  ctx.root = full
  ctx.index = createIndex({
    list: async () => flatten(await vault.scanVault(full)),
    read: (rel) => vault.readNote(full, rel),
    stat: (rel) => vault.statFile(full, rel),
  })
  await ctx.index.rebuild()
  startWatching(ctx)
  await state.addRecentVault(full)
  ctx.win.setTitle(`${basename(full)} – granite-vaulting`)
  return { root: full, name: basename(full), assetBase: `gv-asset://${ctx.token}/`, tree: await vault.scanVault(full) }
}

function filesUnder(ctx, rel) {
  return ctx.index.files().filter((f) => f === rel || f.startsWith(rel + '/'))
}

// Rename or move, then rewrite the links that pointed at what moved (R2.4).
// A note whose text changed since it was indexed is left alone and reported.
async function moveEntry(ctx, from, to) {
  const moves = filesUnder(ctx, from).map((f) => [f, to + f.slice(from.length)])
  const edits = ctx.index.planRename(moves)
  await vault.move(ctx.root, from, to)
  const updated = []
  const skipped = []
  for (const edit of edits) {
    try {
      const now = await vault.readNote(ctx.root, edit.path)
      if (now !== edit.before) {
        skipped.push(edit.path)
        continue
      }
      await vault.writeNote(ctx.root, edit.path, edit.text)
      updated.push(edit.path)
    } catch {
      skipped.push(edit.path)
    }
  }
  await ctx.index.update([...moves.map((m) => m[1]), ...updated])
  return { path: to, updated, skipped }
}

function registerIpc() {
  const on = (channel, fn) => ipcMain.handle(channel, (e, ...args) => fn(e, ...args))
  on('vault:recent', () => state.recentVaults())
  on('vault:forget', (_e, dir) => state.removeRecentVault(dir))
  on('tabs:get', (e) => state.tabsFor(rootOf(e)))
  on('layout:get', () => state.layout())
  on('layout:set', (_e, layout) => state.setLayout(layout))
  on('tabs:set', (e, tabs) => state.setTabsFor(rootOf(e), tabs))
  // A native context menu: items are { id, label } or { type: 'separator' };
  // resolves with the chosen id, or null when the menu is dismissed.
  on('ui:menu', (e, items) =>
    new Promise((resolveChoice) => {
      let chosen = null
      const menu = Menu.buildFromTemplate(
        items.map((it) => (it.type === 'separator' ? { type: 'separator' } : { label: String(it.label), enabled: it.enabled !== false, click: () => (chosen = it.id) })),
      )
      menu.popup({ window: BrowserWindow.fromWebContents(e.sender), callback: () => setTimeout(() => resolveChoice(chosen), 0) })
    }),
  )
  on('vault:choose', async (e) => {
    const ctx = ctxOf(e)
    const result = await dialog.showOpenDialog(ctx.win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return openVault(ctx, result.filePaths[0])
  })
  on('vault:open', (e, dir) => openVault(ctxOf(e), dir))
  on('vault:tree', (e) => vault.scanVault(rootOf(e)))
  on('window:new', () => void createWindow())
  on('note:read', (e, rel) => vault.readNote(rootOf(e), rel))
  on('app:about', () => openAboutWindow())
  on('app:licenses', () => openLicensesWindow())
  on('file:stat', (e, rel) => vault.statFile(rootOf(e), rel))
  on('open:path', async (e, rel) => {
    // shell.openPath returns an error message, or '' on success.
    return shell.openPath(vault.resolveInside(rootOf(e), rel))
  })
  on('note:write', (e, rel, text) => vault.writeNote(rootOf(e), rel, text))
  on('entry:createNote', (e, folder, base) => vault.createNote(rootOf(e), folder, base))
  on('entry:createFolder', (e, folder) => vault.createFolder(rootOf(e), folder))
  on('entry:move', (e, from, to) => (rootOf(e), moveEntry(ctxOf(e), from, to)))
  on('entry:trash', (e, rel) => vault.trash(rootOf(e), rel, (p) => shell.trashItem(p)))
  on('links:backlinks', (e, rel) => (rootOf(e), ctxOf(e).index.backlinks(rel)))
  on('links:unlinked', (e, rel) => (rootOf(e), ctxOf(e).index.unlinkedMentions(rel)))
  on('links:outgoing', (e, rel) => (rootOf(e), ctxOf(e).index.outgoing(rel)))
  on('search', (e, query) => (rootOf(e), ctxOf(e).index.search(query)))
  on('tags', (e) => (rootOf(e), ctxOf(e).index.tags()))
  on('settings:get', (e, name) => readSettings(rootOf(e), name))
  on('settings:set', (e, name, values) => writeSettings(rootOf(e), name, values))
  on('base:render', async (e, rel, thisPath = null) => {
    const index = ctxOf(e).index
    return renderBase(await vault.readNote(rootOf(e), rel), index.entries(), { basePath: rel, thisPath, resolve: index.resolve, now: Date.now() })
  })
  on('open:external', (_e, url) => {
    if (!/^(https?|mailto):/i.test(url)) throw new Error(`not an external link: ${url}`)
    return shell.openExternal(url)
  })
  ipcMain.on('app:flushed', (e) => {
    const ctx = contexts.get(e.sender.id)
    if (ctx) finishClose(ctx)
  })
}

// After the renderer has flushed: resume the quit, or the close, it interrupted.
function finishClose(ctx) {
  if (ctx.flushed) return
  ctx.flushed = true
  if (quitting) app.quit()
  else if (!ctx.win.isDestroyed()) ctx.win.close()
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'granite-vaulting',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Chromium's PDF viewer, for PDF attachments.
      plugins: true,
    },
    // Linux takes the window icon from here; macOS and Windows from the package.
    ...(process.platform === 'linux' ? { icon: appIcon } : {}),
  })
  // No page, a vault HTML file included, may open windows of its own.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const id = win.webContents.id
  const ctx = { win, root: null, watcher: null, index: null, flushed: false, token: randomBytes(12).toString('hex') }
  contexts.set(id, ctx)
  // Unsaved edits are written before the window closes: the renderer is asked
  // to flush, and the close proceeds when it replies (or after 3 s).
  win.on('close', (e) => {
    if (ctx.flushed) return
    e.preventDefault()
    win.webContents.send('app:flush')
    setTimeout(() => finishClose(ctx), 3000)
  })
  win.on('closed', () => {
    ctx.watcher?.close()
    contexts.delete(id)
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const about = { label: 'About granite-vaulting', click: () => openAboutWindow() }
  const licenses = { label: 'Open Source Licenses…', click: () => openLicensesWindow() }
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [about, licenses, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        {
          label: 'Quick Switcher…',
          accelerator: 'CmdOrCtrl+O',
          click: (_item, win) => win?.webContents.send('ui:quick-switcher'),
        },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: (_item, win) => win?.webContents.send('ui:close-tab') },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
        ...(isMac ? [] : [{ role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Left Panel', accelerator: 'CmdOrCtrl+\\', click: (_item, win) => win?.webContents.send('ui:toggle-drawer', 'left') },
        { label: 'Toggle Right Panel', accelerator: 'CmdOrCtrl+Shift+\\', click: (_item, win) => win?.webContents.send('ui:toggle-drawer', 'right') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    // Help carries About and the licences on every platform, so Windows and
    // Linux, which have no application menu, reach them too.
    { role: 'help', submenu: [about, licenses] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  // A packaged app carries its icon; running from source, the Dock shows it too.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
  registerIpc()
  serveAssets()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
