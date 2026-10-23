// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import pkg from '../../package.json'

contextBridge.exposeInMainWorld('scrinotia', {
  version: pkg.version,
  recentVaults: () => ipcRenderer.invoke('vault:recent'),
  forgetVault: (dir) => ipcRenderer.invoke('vault:forget', dir),
  getTabs: () => ipcRenderer.invoke('tabs:get'),
  getLayout: () => ipcRenderer.invoke('layout:get'),
  setLayout: (layout) => ipcRenderer.invoke('layout:set', layout),
  onToggleDrawer: (fn) => ipcRenderer.on('ui:toggle-drawer', (_e, side) => fn(side)),
  onCycleMode: (fn) => ipcRenderer.on('ui:cycle-mode', () => fn()),
  onPrint: (fn) => ipcRenderer.on('ui:print', () => fn()),
  print: () => ipcRenderer.invoke('note:print'),
  setTabs: (tabs) => ipcRenderer.invoke('tabs:set', tabs),
  menu: (items) => ipcRenderer.invoke('ui:menu', items),
  editCommand: (command) => ipcRenderer.invoke('edit:do', command),
  addToDictionary: (word) => ipcRenderer.invoke('spell:add', word),
  replaceMisspelling: (word) => ipcRenderer.invoke('spell:replace', word),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  openVault: (dir) => ipcRenderer.invoke('vault:open', dir),
  tree: () => ipcRenderer.invoke('vault:tree'),
  readNote: (rel) => ipcRenderer.invoke('note:read', rel),
  writeNote: (rel, text) => ipcRenderer.invoke('note:write', rel, text),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  statFile: (rel) => ipcRenderer.invoke('file:stat', rel),
  // The path of a file dropped from the desktop (File objects carry no path in the page).
  pathForFile: (file) => webUtils.getPathForFile(file),
  importFile: (sourcePath) => ipcRenderer.invoke('file:import', sourcePath),
  pasteImage: (ext, bytes) => ipcRenderer.invoke('file:paste', ext, bytes),
  readBytes: (rel) => ipcRenderer.invoke('file:readBytes', rel),
  openAbout: () => ipcRenderer.invoke('app:about'),
  openLicenses: () => ipcRenderer.invoke('app:licenses'),
  openPath: (rel) => ipcRenderer.invoke('open:path', rel),
  showPath: (rel) => ipcRenderer.invoke('show:path', rel),
  platform: process.platform,
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
  // Sets the window's full-screen state; resolves with whether it was full screen before.
  setFullScreen: (on) => ipcRenderer.invoke('window:fullscreen', on),
  onLeftFullScreen: (fn) => ipcRenderer.on('window:left-full-screen', () => fn()),
  onFrameMenu: (fn) => ipcRenderer.on('ui:frame-menu', (_e, url) => fn(url)),
  onEditMenu: (fn) => ipcRenderer.on('ui:edit-menu', (_e, params) => fn(params)),
  onEscape: (fn) => ipcRenderer.on('ui:escape', () => fn()),
  onSwipe: (fn) => ipcRenderer.on('ui:swipe', (_e, direction) => fn(direction)),
  backlinks: (rel) => ipcRenderer.invoke('links:backlinks', rel),
  unlinkedMentions: (rel) => ipcRenderer.invoke('links:unlinked', rel),
  outgoing: (rel) => ipcRenderer.invoke('links:outgoing', rel),
  search: (query) => ipcRenderer.invoke('search', query),
  tags: () => ipcRenderer.invoke('tags'),
  renderBase: (rel, thisPath = null) => ipcRenderer.invoke('base:render', rel, thisPath),
  getSettings: (name) => ipcRenderer.invoke('settings:get', name),
  setSettings: (name, values) => ipcRenderer.invoke('settings:set', name, values),
  onSettings: (fn) => ipcRenderer.on('ui:settings', () => fn()),
  onQuickSwitcher: (fn) => ipcRenderer.on('ui:quick-switcher', () => fn()),
  onCloseTab: (fn) => ipcRenderer.on('ui:close-tab', () => fn()),
  onVaultChanged: (fn) => ipcRenderer.on('vault:changed', (_e, paths) => fn(paths)),
})
