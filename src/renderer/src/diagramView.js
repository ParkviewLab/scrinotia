// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pan and zoom for a Mermaid diagram (R3.8.1). The diagram's SVG is drawn at
// its natural size inside a frame that clips it, and moved with a CSS
// transform: dragging pans; the scroll wheel, a two-finger scroll or a pinch
// zooms about the pointer; a double-click zooms in one step at the point
// clicked. A view is { s, x, y }: the scale and the SVG's offset in the frame.

const MIN_SCALE = 0.05
const MAX_SCALE = 40
const STEP = 1.6

// The views kept across redraws while one note stays open, by diagram key.
const views = new Map()
let viewsFor = null

// Forgets every kept view when the note shown is not the one they belong to.
export function keepViewsFor(notePath) {
  if (viewsFor === notePath) return
  views.clear()
  viewsFor = notePath
}

// The diagram's natural size, from its viewBox (Mermaid always sets one).
function naturalSize(svg) {
  const vb = svg.viewBox?.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height }
  const r = svg.getBBox()
  return { w: r.width || 1, h: r.height || 1 }
}

// frame: an element in the document that holds svg and clips it.
// options.key: where to keep the view across redraws (none in full screen).
// options.fillHeight: the frame's height is set by CSS (full screen); otherwise
// it is the diagram's height at the frame's width, as before pan and zoom.
// options.onMenu(event, controls): the right-click menu.
export function attachPanZoom(frame, svg, { key = null, fillHeight = false, onMenu } = {}) {
  const { w, h } = naturalSize(svg)
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.style.maxWidth = 'none'
  frame.classList.add('diagram-frame')

  let view = null
  let touched = false // moved by the reader; otherwise it follows the frame's size

  const size = () => ({ fw: frame.clientWidth, fh: frame.clientHeight })
  const setHeight = () => {
    if (!fillHeight) frame.style.height = `${Math.ceil(h * Math.min(1, frame.clientWidth / w))}px`
  }
  const apply = () => {
    svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`
    if (key) views.set(key, { ...view, w, h })
  }
  const fit = () => {
    const { fw, fh } = size()
    const s = Math.min(fw / w, fh / h, fillHeight ? Infinity : 1)
    view = { s, x: (fw - w * s) / 2, y: (fh - h * s) / 2 }
    touched = false
    apply()
  }
  // Scales by factor about the frame point (px, py), within the limits.
  const zoomAt = (factor, px, py) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.s * factor))
    const k = s / view.s
    view = { s, x: px - (px - view.x) * k, y: py - (py - view.y) * k }
    touched = true
    apply()
  }
  const point = (e) => {
    const r = frame.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  setHeight()
  const kept = key && views.get(key)
  if (kept && kept.w === w && kept.h === h) {
    view = { s: kept.s, x: kept.x, y: kept.y }
    touched = true
    apply()
  } else fit()

  // A frame that changes size (the panel resized, full screen arriving)
  // keeps the reader's view, or is fitted again if the reader has not moved it.
  const resizer = new ResizeObserver(() => {
    if (!frame.isConnected) return resizer.disconnect()
    setHeight()
    if (!touched) fit()
  })
  resizer.observe(frame)

  frame.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      // A pinch arrives as a wheel event with ctrlKey and small deltas.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))
      zoomAt(factor, ...point(e))
    },
    { passive: false },
  )

  frame.addEventListener('dblclick', (e) => {
    e.preventDefault()
    zoomAt(STEP, ...point(e))
  })

  frame.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    frame.setPointerCapture(e.pointerId)
    frame.classList.add('panning')
    let last = [e.clientX, e.clientY]
    const move = (ev) => {
      if (ev.buttons === 0) return end()
      view = { ...view, x: view.x + ev.clientX - last[0], y: view.y + ev.clientY - last[1] }
      last = [ev.clientX, ev.clientY]
      touched = true
      apply()
    }
    // Ends however the pointer is let go, as the panel splitters do.
    const end = () => {
      frame.classList.remove('panning')
      frame.removeEventListener('pointermove', move)
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) frame.removeEventListener(type, end)
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId)
    }
    frame.addEventListener('pointermove', move)
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) frame.addEventListener(type, end)
  })

  const controls = { fit, svg }
  frame.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onMenu?.(e, controls)
  })
  return controls
}
