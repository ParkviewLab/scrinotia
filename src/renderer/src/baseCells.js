// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rendering of the typed cells a .base view returns (see toCell in
// src/main/bases.js). Text is set as text; html() output is sanitised.

import DOMPurify from 'dompurify'

export function renderCell(cell, { openTarget, assetUrl }) {
  switch (cell.t) {
    case 'link': {
      const a = document.createElement('a')
      a.textContent = cell.text
      if (!cell.path) a.classList.add('unresolved')
      a.addEventListener('click', () => openTarget(cell))
      return a
    }
    case 'list': {
      const span = document.createElement('span')
      span.className = 'cell-list'
      cell.items.forEach((item, i) => {
        if (i) span.append(', ')
        span.append(renderCell(item, { openTarget, assetUrl }))
      })
      return span
    }
    case 'bool': {
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = cell.v
      box.disabled = true
      return box
    }
    case 'image': {
      const src = cell.path ? assetUrl(cell.path) : cell.src
      if (!src) return document.createTextNode(cell.text)
      const img = document.createElement('img')
      img.className = 'cell-image'
      img.src = src
      img.alt = cell.text
      return img
    }
    case 'html': {
      const span = document.createElement('span')
      span.innerHTML = DOMPurify.sanitize(cell.html, { ALLOWED_URI_REGEXP: /^(?:https?|mailto|scrinotia-asset):|^#/i })
      return span
    }
    case 'error': {
      const span = document.createElement('span')
      span.className = 'cell-error'
      span.textContent = '⚠'
      span.title = cell.text
      return span
    }
    default:
      return document.createTextNode(cell.text ?? '')
  }
}
