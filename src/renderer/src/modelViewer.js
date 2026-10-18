// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The STL model viewer (R2.6): a lit mesh in a WebGL canvas, framed to fit,
// with orbit (left drag), zoom (wheel) and pan (right drag). three.js is
// loaded only when a model is first shown. The viewer releases its WebGL
// context as soon as its element leaves the document, since the preview
// replaces every embed on each redraw and Chromium allows few live contexts.

const MODEL_LIMIT = 200 * 1024 * 1024

const COLOURS = {
  dark: { background: 0x17181a, mesh: 0x9aa9d8 },
  light: { background: 0xf4f5f7, mesh: 0x5a6fa8 },
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
  const { THREE, OrbitControls } = three
  const colours = COLOURS[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark']

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setClearColor(colours.background)
  container.append(renderer.domElement)

  const scene = new THREE.Scene()
  const material = new THREE.MeshStandardMaterial({ color: colours.mesh, metalness: 0.1, roughness: 0.6 })
  geometry.center()
  scene.add(new THREE.Mesh(geometry, material))
  scene.add(new THREE.AmbientLight(0xffffff, 0.6))

  // STL files are usually drawn with Z up; the camera looks from the front
  // right and above, at a distance that fits the bounding sphere in view.
  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere.radius || 1
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100)
  camera.up.set(0, 0, 1)
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15
  camera.position.set(1, -1.4, 0.9).normalize().multiplyScalar(distance)
  // The directional light rides with the camera, so the side in view is lit.
  const light = new THREE.DirectionalLight(0xffffff, 2.2)
  light.position.set(0.5, 1, 1)
  camera.add(light)
  scene.add(camera)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.update()

  const draw = () => renderer.render(scene, camera)
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
  resize()

  // The element is gone when the pane shows another file or the preview is
  // redrawn; checked on each document change rather than per frame, since
  // the viewer draws only when the view changes.
  const watcher = new MutationObserver(() => {
    if (container.isConnected) return
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
