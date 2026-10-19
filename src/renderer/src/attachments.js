// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Attachments (R2.6): images, PDFs, audio and video are shown from the vault
// through the scrinotia-asset protocol; text-like files are shown as read-only
// text; STL models are shown in a 3D viewer (modelViewer.js); HTML is
// rendered in a sandboxed frame whose scripts run in an origin of their own,
// cut off from the app and the rest of the vault; anything else is
// described, with a button to open it in the system's application.

import { mountModel } from './modelViewer.js'

const KINDS = [
  ['image', /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i],
  ['pdf', /\.pdf$/i],
  ['audio', /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm-audio)$/i],
  ['video', /\.(mp4|m4v|mov|webm|ogv|mkv)$/i],
  ['html', /\.html?$/i],
  ['model', /\.stl$/i],
  ['text', /\.(txt|text|json|jsonc|csv|tsv|log|xml|ya?ml|toml|ini|cfg|conf|css|js|mjs|ts|py|rs|go|sh|bash|zsh|sql|tex|bib|rtf|srt|vtt)$/i],
]

export function attachmentKind(path) {
  return KINDS.find(([, re]) => re.test(path))?.[0] ?? 'other'
}

const TEXT_LIMIT = 2 * 1024 * 1024

function formatSize(bytes) {
  if (bytes === undefined || bytes === null) return ''
  const units = ['bytes', 'KB', 'MB', 'GB']
  let n = bytes
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return u === 0 ? `${n} bytes` : `${n.toFixed(1)} ${units[u]}`
}

// path: vault-relative; url: its scrinotia-asset URL; api: the preload API;
// embedded: a smaller form inside a note.
export async function renderAttachment(host, { path, url, api, embedded = false, onModelMenu }) {
  host.replaceChildren()
  const name = path.slice(path.lastIndexOf('/') + 1)
  const kind = attachmentKind(path)
  const box = document.createElement('div')
  let model = null
  box.className = `attachment attachment-${kind}${embedded ? ' attachment-embedded' : ''}`
  switch (kind) {
    case 'image': {
      const img = document.createElement('img')
      img.src = url
      img.alt = name
      box.append(img)
      break
    }
    case 'pdf': {
      const frame = document.createElement('iframe')
      frame.src = url
      frame.title = name
      box.append(frame)
      break
    }
    case 'audio':
    case 'video': {
      const media = document.createElement(kind)
      media.controls = true
      media.preload = 'metadata'
      media.src = url
      box.append(media)
      break
    }
    case 'html': {
      const frame = document.createElement('iframe')
      // Scripts run, but without allow-same-origin the page has an opaque
      // origin: it cannot reach the app, its preload interface, or other
      // vault files (the scrinotia-asset server sends no cross-origin permission),
      // and it cannot open pop-ups or navigate the app.
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals')
      frame.src = url
      frame.title = name
      box.append(frame)
      break
    }
    case 'model': {
      // Started once the box is in the document, so the canvas has a size.
      model = document.createElement('div')
      model.className = 'model-view'
      model.title = `${name}: drag to rotate, scroll to zoom, right-drag to pan`
      box.append(model)
      break
    }
    case 'text': {
      const info = await api.statFile(path).catch(() => null)
      if (info && info.size > TEXT_LIMIT) {
        box.append(details(name, info, api, path, `This file is ${formatSize(info.size)}, too large to show as text.`))
        break
      }
      const pre = document.createElement('pre')
      pre.className = 'attachment-text'
      pre.textContent = await api.readNote(path).catch((err) => `Could not read the file: ${err.message ?? err}`)
      box.append(pre)
      break
    }
    default: {
      const info = await api.statFile(path).catch(() => null)
      box.append(details(name, info, api, path))
    }
  }
  host.append(box)
  if (model) mountModel(model, { path, api, onMenu: onModelMenu })
}

function details(name, info, api, path, note = null) {
  const card = document.createElement('div')
  card.className = 'attachment-details'
  const title = document.createElement('div')
  title.className = 'attachment-name'
  title.textContent = name
  card.append(title)
  if (info) {
    const meta = document.createElement('div')
    meta.className = 'muted'
    meta.textContent = `${formatSize(info.size)} · modified ${new Date(info.mtime).toLocaleString()}`
    card.append(meta)
  }
  if (note) {
    const p = document.createElement('p')
    p.className = 'muted'
    p.textContent = note
    card.append(p)
  }
  const open = document.createElement('button')
  open.type = 'button'
  open.textContent = 'Open in default application'
  const status = document.createElement('span')
  status.className = 'muted'
  open.addEventListener('click', async () => {
    const err = await api.openPath(path).catch((e) => String(e.message ?? e))
    status.textContent = err ? ` ${err}` : ''
  })
  card.append(open, status)
  return card
}
