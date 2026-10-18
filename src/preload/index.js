// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron'
import pkg from '../../package.json'

contextBridge.exposeInMainWorld('granite', {
  version: pkg.version,
  recentVaults: () => ipcRenderer.invoke('vault:recent'),
  forgetVault: (dir) => ipcRenderer.invoke('vault:forget', dir),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  openVault: (dir) => ipcRenderer.invoke('vault:open', dir),
  tree: () => ipcRenderer.invoke('vault:tree'),
  readNote: (rel) => ipcRenderer.invoke('note:read', rel),
  writeNote: (rel, text) => ipcRenderer.invoke('note:write', rel, text),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onFlush: (fn) =>
    ipcRenderer.on('app:flush', async () => {
      try {
        await fn()
      } finally {
        ipcRenderer.send('app:flushed')
      }
    }),
  createNote: (folder, base) => ipcRenderer.invoke('entry:createNote', folder, base),
  createFolder: (folder) => ipcRenderer.invoke('entry:createFolder', folder),
  move: (from, to) => ipcRenderer.invoke('entry:move', from, to),
  trash: (rel) => ipcRenderer.invoke('entry:trash', rel),
  onVaultChanged: (fn) => ipcRenderer.on('vault:changed', (_e, paths) => fn(paths)),
})
