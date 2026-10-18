// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { watch } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, basename, sep } from 'node:path'
import * as vault from './vault.js'
import { createState } from './state.js'

let win = null
let root = null
let watcher = null
const state = createState(app.getPath('userData'))

function requireVault() {
  if (!root) throw new Error('no vault is open')
  return root
}

// External changes (R1.5): a recursive watch, debounced, reporting the changed
// vault-relative paths; hidden entries are ignored.
function startWatching(dir) {
  watcher?.close()
  let pending = new Set()
  let timer = null
  watcher = watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const rel = filename.split(sep).join('/')
    if (rel.split('/').some(vault.isHidden)) return
    pending.add(rel)
    clearTimeout(timer)
    timer = setTimeout(() => {
      const paths = [...pending]
      pending = new Set()
      win?.webContents.send('vault:changed', paths)
    }, 150)
  })
}

async function openVault(dir) {
  const info = await stat(dir)
  if (!info.isDirectory()) throw new Error(`not a folder: ${dir}`)
  root = dir
  startWatching(dir)
  await state.addRecentVault(dir)
  win?.setTitle(`${basename(dir)} – granite-vaulting`)
  return { root: dir, name: basename(dir), tree: await vault.scanVault(dir) }
}

function registerIpc() {
  ipcMain.handle('vault:recent', () => state.recentVaults())
  ipcMain.handle('vault:forget', (_e, dir) => state.removeRecentVault(dir))
  ipcMain.handle('vault:choose', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return openVault(result.filePaths[0])
  })
  ipcMain.handle('vault:open', (_e, dir) => openVault(dir))
  ipcMain.handle('vault:tree', () => vault.scanVault(requireVault()))
  ipcMain.handle('note:read', (_e, rel) => vault.readNote(requireVault(), rel))
  ipcMain.handle('entry:createNote', (_e, folder) => vault.createNote(requireVault(), folder))
  ipcMain.handle('entry:createFolder', (_e, folder) => vault.createFolder(requireVault(), folder))
  ipcMain.handle('entry:move', (_e, from, to) => vault.move(requireVault(), from, to))
  ipcMain.handle('entry:trash', (_e, rel) => vault.trash(requireVault(), rel, (p) => shell.trashItem(p)))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'granite-vaulting',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.on('closed', () => {
    win = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  watcher?.close()
  if (process.platform !== 'darwin') app.quit()
})
