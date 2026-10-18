// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { contextBridge, ipcRenderer } from 'electron'
import pkg from '../../package.json'

contextBridge.exposeInMainWorld('granite', {
  version: pkg.version,
  recentVaults: () => ipcRenderer.invoke('vault:recent'),
  forgetVault: (dir) => ipcRenderer.invoke('vault:forget', dir),
  getTabs: () => ipcRenderer.invoke('tabs:get'),
  setTabs: (tabs) => ipcRenderer.invoke('tabs:set', tabs),
  menu: (items) => ipcRenderer.invoke('ui:menu', items),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  openVault: (dir) => ipcRenderer.invoke('vault:open', dir),
  tree: () => ipcRenderer.invoke('vault:tree'),
  readNote: (rel) => ipcRenderer.invoke('note:read', rel),
  writeNote: (rel, text) => ipcRenderer.invoke('note:write', rel, text),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  statFile: (rel) => ipcRenderer.invoke('file:stat', rel),
  readBytes: (rel) => ipcRenderer.invoke('file:readBytes', rel),
  openAbout: () => ipcRenderer.invoke('app:about'),
  openLicenses: () => ipcRenderer.invoke('app:licenses'),
  openPath: (rel) => ipcRenderer.invoke('open:path', rel),
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
  newWindow: () => ipcRenderer.invoke('window:new'),
  backlinks: (rel) => ipcRenderer.invoke('links:backlinks', rel),
  unlinkedMentions: (rel) => ipcRenderer.invoke('links:unlinked', rel),
  outgoing: (rel) => ipcRenderer.invoke('links:outgoing', rel),
  search: (query) => ipcRenderer.invoke('search', query),
  tags: () => ipcRenderer.invoke('tags'),
  renderBase: (rel, thisPath = null) => ipcRenderer.invoke('base:render', rel, thisPath),
  getSettings: (name) => ipcRenderer.invoke('settings:get', name),
  setSettings: (name, values) => ipcRenderer.invoke('settings:set', name, values),
  onQuickSwitcher: (fn) => ipcRenderer.on('ui:quick-switcher', () => fn()),
  onCloseTab: (fn) => ipcRenderer.on('ui:close-tab', () => fn()),
  onVaultChanged: (fn) => ipcRenderer.on('vault:changed', (_e, paths) => fn(paths)),
})
