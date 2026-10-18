// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The STL model viewer (R2.6): a lit mesh in a WebGL canvas, framed to fit,
// with orbit (left drag), zoom (wheel) and pan (right drag). three.js is
// loaded only when a model is first shown. The viewer releases its WebGL
// context as soon as its element leaves the document, since the preview
// replaces every embed on each redraw and Chromium allows few live contexts.
//
// The model's colour is one for both themes, set in the Settings dialog
// (R6.8); every model on screen takes a new colour at once.

const MODEL_LIMIT = 200 * 1024 * 1024

const BACKGROUNDS = { dark: 0x1e1f22, light: 0xf4f5f7 }

// The directional light is orbited round the point the camera looks at:
// KEY_LIGHT.angle degrees off the line of sight, towards KEY_LIGHT.toward
// degrees (0 = right, 90 = up, as seen on screen).
const KEY_LIGHT = { angle: 45, toward: 45 }

// The even fill light, kept low so that shadowed sides stay dark enough to
// read.
const AMBIENT = 0.3

export const DEFAULT_MODEL_COLOUR = { h: 225, s: 40, l: 62 }

// A colour as stored ({ h: 0–360, s: 0–100, l: 0–100 }), or the default when
// the stored value is missing or malformed.
export function normaliseColour(c) {
  const ok = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max
  if (!c || !ok(c.h, 360) || !ok(c.s, 100) || !ok(c.l, 100)) return { ...DEFAULT_MODEL_COLOUR }
  return { h: Math.round(c.h), s: Math.round(c.s), l: Math.round(c.l) }
}

export function colourCss(c) {
  return `hsl(${c.h}, ${c.s}%, ${c.l}%)`
}

let modelColour = { ...DEFAULT_MODEL_COLOUR }
const shown = new Set() // { material, draw } of each model on screen

export function setModelColour(c) {
  modelColour = normaliseColour(c)
  for (const view of shown) {
    view.material.color.setHSL(modelColour.h / 360, modelColour.s / 100, modelColour.l / 100, 'srgb')
    view.draw()
  }
}

let threeModules = null
function loadThree() {
  threeModules ??= Promise.all([
    import('three'),
    import('three/addons/loaders/STLLoader.js'),
    import('three/addons/controls/OrbitControls.js'),
  ]).then(([THREE, { STLLoader }, { OrbitControls }]) => ({ THREE, STLLoader, OrbitControls }))
  return threeModules
}

// The geometry of an STL file (binary or ASCII). The loader throws on some
// unreadable files and returns no triangles for most others; both are
// reported as one error.
export function parseStl(STLLoader, bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  let geometry
  try {
    geometry = new STLLoader().parse(buffer)
  } catch {
    throw new Error('the file holds no readable triangles')
  }
  const count = geometry.getAttribute('position')?.count ?? 0
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (count === 0 || !box || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
    geometry.dispose()
    throw new Error('the file holds no readable triangles')
  }
  // Recomputed, since many exporters write zero normals; on unindexed
  // triangles this gives each face its own flat normal.
  geometry.computeVertexNormals()
  return geometry
}

function showError(container, message) {
  container.replaceChildren()
  container.classList.add('model-error')
  const p = document.createElement('p')
  p.className = 'muted'
  p.textContent = `Could not show this model: ${message}`
  container.append(p)
}

// A torus knot in the model colour, for the Settings dialog's preview.
export async function mountPreviewModel(container) {
  const three = await loadThree()
  if (!container.isConnected) return
  show(container, three, new three.THREE.TorusKnotGeometry(1, 0.32, 160, 24))
}

// container: an element already in the document, sized by CSS.
export async function mountModel(container, { path, api }) {
  let three, geometry
  try {
    const info = await api.statFile(path).catch(() => null)
    if (info && info.size > MODEL_LIMIT) throw new Error(`it is ${Math.round(info.size / 1024 / 1024)} MB, more than the viewer reads`)
    const [modules, bytes] = await Promise.all([loadThree(), api.readBytes(path)])
    three = modules
    if (!container.isConnected) return
    geometry = parseStl(three.STLLoader, bytes)
  } catch (err) {
    if (container.isConnected) showError(container, err.message ?? String(err))
    return
  }
  if (!container.isConnected) {
    geometry.dispose()
    return
  }
  show(container, three, geometry)
}

function show(container, three, geometry) {
  const { THREE, OrbitControls } = three
  const background = BACKGROUNDS[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  // Shadows: relief such as a raised mark casts a shadow beside its edges.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(background)
  container.append(renderer.domElement)

  const scene = new THREE.Scene()
  const material = new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6 })
  material.color.setHSL(modelColour.h / 360, modelColour.s / 100, modelColour.l / 100, 'srgb')
  geometry.center()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  scene.add(mesh)
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT))

  // STL files are usually drawn with Z up; the camera looks from the front
  // right and above, at a distance that fits the bounding sphere in view.
  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere.radius || 1
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100)
  camera.up.set(0, 0, 1)
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15
  camera.position.set(1, -1.4, 0.9).normalize().multiplyScalar(distance)
  // The directional light rides with the camera, so the side in view is lit,
  // but from above and to the right of the line of sight (KEY_LIGHT), the
  // same angle for every model and zoom, so that relief facing the viewer
  // still shows. It points where the camera looks.
  const light = new THREE.DirectionalLight(0xffffff, 2.2)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  // The shadow camera covers the model's bounding sphere; the biases keep a
  // curved surface from shadowing itself in speckles.
  Object.assign(light.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius })
  light.shadow.bias = -0.0005
  light.shadow.normalBias = radius * 0.004
  camera.add(light)
  scene.add(light.target)
  scene.add(camera)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.update()

  // In the camera's frame the target is d ahead (0, 0, -d); the light sits on
  // the sphere of radius d round it, KEY_LIGHT.angle from the camera.
  const placeLight = () => {
    const d = camera.position.distanceTo(controls.target)
    const a = (KEY_LIGHT.angle * Math.PI) / 180
    const t = (KEY_LIGHT.toward * Math.PI) / 180
    light.position.set(d * Math.sin(a) * Math.cos(t), d * Math.sin(a) * Math.sin(t), d * Math.cos(a) - d)
    light.target.position.copy(controls.target)
    light.shadow.camera.near = Math.max(radius * 0.01, d - radius * 1.2)
    light.shadow.camera.far = d + radius * 1.2
    light.shadow.camera.updateProjectionMatrix()
  }
  const draw = () => {
    placeLight()
    renderer.render(scene, camera)
  }
  const resize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    draw()
  }
  const resizer = new ResizeObserver(resize)
  resizer.observe(container)
  controls.addEventListener('change', draw)
  const view = { material, draw }
  shown.add(view)
  resize()

  // The element is gone when the pane shows another file or the preview is
  // redrawn; checked on each document change rather than per frame, since
  // the viewer draws only when the view changes.
  const watcher = new MutationObserver(() => {
    if (container.isConnected) return
    shown.delete(view)
    watcher.disconnect()
    resizer.disconnect()
    controls.dispose()
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  })
  watcher.observe(document.body, { childList: true, subtree: true })
}
