// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The About window, with the statement on Obsidian and the format references
// (R7.3), and the Open Source Licenses window, which lists the bundled
// packages and the two MIT-licensed format references from the generated
// legal/ bundle (see the handbook's electron-tooling.md).

import { app, BrowserWindow, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import nameCard from '../../brand/scrinotia-icon-kit/brand/scrinotia-name-card.png?asset'
import { checkForUpdate } from './update.js'

const SOURCE_URL = 'https://github.com/garycoding/scrinotia'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const STYLE = `
  :root{--bg:#1e1f22;--panel:#17181a;--fg:#dcddde;--muted:#8b8e94;--line:#2a2c30;--accent:#7f9cf5}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--fg);font:13px/1.55 system-ui,sans-serif}
  a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}`

// Escape dismisses the About and licences windows, as it does a dialog.
const CLOSE_ON_ESCAPE = `<script>addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close() })</script>`

// Links open in the system's browser or application, never inside the app.
function lockDown(win) {
  const open = (url) => (url.startsWith('file:') ? shell.openPath(fileURLToPath(url)) : shell.openExternal(url))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|file):/i.test(url)) open(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault()
    if (/^(https?|file):/i.test(url)) open(url)
  })
}

function pngData(file) {
  try {
    return readFileSync(file).toString('base64')
  } catch {
    return ''
  }
}

// Reports the content's height to main whenever it changes, as a console
// message "scrinotia-about-height <px>".
const FIT_TO_CONTENT = `<script>(() => { const wrap = document.querySelector('.wrap'); new ResizeObserver(() => console.info('scrinotia-about-height ' + Math.ceil(wrap.getBoundingClientRect().height))).observe(wrap) })()</script>`

// The name card's ground, from the icon kit's palette.
const MIDNIGHT = '#0B1226'
const ABOUT_WIDTH = 520

let aboutWin = null
export function openAboutWindow() {
  if (aboutWin && !aboutWin.isDestroyed()) return aboutWin.focus()
  const html = `<!doctype html><meta charset="utf-8"><title>About Scrinotia</title><style>${STYLE}
  /* The window takes the height of this content (see openAboutWindow), on
     the name card's midnight blue. */
  html,body{height:auto;overflow:hidden;background:${MIDNIGHT}}
  .wrap{padding:28px 34px 30px;display:flex;flex-direction:column;align-items:center;text-align:center;-webkit-user-select:none;cursor:default}
  /* The kit's name card is a dark card on a cream margin (56 px of 1772 by
     500); the frame shows the card alone, trimming 2 px more so that no
     cream shows at its edge. */
  .card{width:440px;aspect-ratio:1656/384;border-radius:16px;overflow:hidden;margin-bottom:14px;flex:none}
  .card img{display:block;width:107.005%;margin:-3.502% 0 0 -3.502%}
  .ver{margin:3px 0 6px;color:var(--muted);font-size:12px}
  /* The update line keeps its height from the first paint, so the answer
     arriving from the network never shifts what is already on screen. */
  .upd{margin:0 0 16px;min-height:18px;color:var(--muted);font-size:12px}
  p{margin:0 0 10px;max-width:34em}
  .copy{margin:14px 0 10px;font-size:11px;color:var(--muted)}
  .links{display:flex;gap:18px;font-size:12px}
  /* The statement on Obsidian (R7.3), closed until its line is clicked. */
  details{max-width:34em;margin:4px 0 0;font-size:12px}
  summary{list-style:none;cursor:pointer;color:var(--accent)}
  summary::-webkit-details-marker{display:none}
  summary::after{content:' ›';display:inline-block;margin-left:4px;transition:transform .15s}
  details[open] summary::after{transform:rotate(90deg)}
  details p{margin:8px 0 0;color:var(--muted)}
</style>
<div class="wrap">
  <div class="card"><img src="data:image/png;base64,${pngData(nameCard)}" alt="Scrinotia, pronounced skri-NO-tee-a: the scroll-case of knowledge, from scrinium and notitia"></div>
  <div class="ver">Version ${esc(app.getVersion())}</div>
  <div class="upd" id="upd">Checking for a newer version…</div>
  <p>An independent, local-first Markdown notes client.</p>
  <details>
    <summary>The .base file format</summary>
    <p>Scrinotia reads vaults and .base files in the formats used by Obsidian, a product of Dynalist Inc. Scrinotia is an independent project, not affiliated with or endorsed by Dynalist Inc. The .base file format is implemented from two MIT-licensed references: the Obsidian API type definitions (Dynalist Inc.) and the obsidian-bases skill (Steph Ango); see Help, Open Source Licenses.</p>
  </details>
  <div class="copy">© 2026 Gary Frattarola · AGPL-3.0-or-later</div>
  <div class="links"><a href="${SOURCE_URL}" target="_blank" rel="noopener">Source code on GitHub</a></div>
</div>
${CLOSE_ON_ESCAPE}
${FIT_TO_CONTENT}`
  aboutWin = new BrowserWindow({
    width: ABOUT_WIDTH,
    height: 420,
    useContentSize: true,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: MIDNIGHT,
    title: 'About Scrinotia',
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  // The window is as tall as its content, so opening or closing "The .base
  // file format" grows or shrinks it. The page reports its height in a
  // console message (see FIT_TO_CONTENT), which reaches main at once without
  // a preload; a window's size is set from its top left corner, so the top
  // stays where it is. It is shown once the first height is known, or after
  // half a second whatever happens.
  const shown = aboutWin
  shown.webContents.on('console-message', (e, _level, legacyMessage) => {
    const height = Number(/^scrinotia-about-height (\d+)$/.exec(e.message ?? legacyMessage)?.[1])
    if (shown.isDestroyed() || !(height > 0)) return
    shown.setContentSize(ABOUT_WIDTH, Math.min(height, 900))
    if (!shown.isVisible()) shown.show()
  })
  setTimeout(() => {
    if (!shown.isDestroyed() && !shown.isVisible()) shown.show()
  }, 500)
  aboutWin.setMenuBarVisibility(false)
  lockDown(aboutWin)
  aboutWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  aboutWin.on('closed', () => {
    aboutWin = null
  })

  // The version check runs here and only here: opening About is the act that
  // asks for it, so the app never reaches the network on its own. The answer
  // is drawn from data with textContent, never interpolated into markup, since
  // the version comes from a third party.
  const win = aboutWin
  checkForUpdate({ currentVersion: app.getVersion() }).then((r) => {
    if (win.isDestroyed()) return
    win.webContents
      .executeJavaScript(
        `(function (r) {
      var el = document.getElementById('upd'); if (!el) return;
      el.textContent = '';
      if (r.state === 'update') {
        var a = document.createElement('a');
        a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Scrinotia ' + r.version + ' is available.';
        el.appendChild(a);
      } else if (r.state === 'current') {
        el.textContent = 'Scrinotia is up to date.';
      } else {
        el.textContent = 'Could not check for a newer version.';
      }
    })(${JSON.stringify(r)})`,
      )
      .catch(() => {})
  })
}

// The packaged legal/ bundle (made by `npm run legal`): in development the
// repository root's legal/, in the packaged app resourcesPath/legal.
function legalDir() {
  return app.isPackaged ? join(process.resourcesPath, 'legal') : join(__dirname, '../../legal')
}

const HIGHLIGHTS = [
  { pkg: 'electron', label: 'Electron', role: 'Desktop runtime (Chromium and Node.js)', note: 'MIT · bundles Chromium and Node.js', repo: 'https://github.com/electron/electron' },
  { pkg: '@codemirror/view', label: 'CodeMirror', role: 'The source editor' },
  { pkg: 'marked', label: 'Marked', role: 'Markdown rendering' },
  { pkg: 'dompurify', label: 'DOMPurify', role: 'Sanitising rendered HTML' },
  { pkg: 'dayjs', label: 'Day.js', role: 'Dates in .base formulas' },
  { pkg: 'yaml', label: 'yaml', role: 'Frontmatter and .base files' },
  { pkg: 'minisearch', label: 'MiniSearch', role: 'Ranked search (BM25+)' },
  { pkg: 'katex', label: 'KaTeX', role: 'Math in notes' },
  { pkg: 'mermaid', label: 'Mermaid', role: 'Diagrams in notes (without its ELK layout)' },
  { pkg: 'three', label: 'three.js', role: 'STL model viewer' },
]

const REFERENCES = [
  { label: 'Obsidian API type definitions', who: '© 2022 Dynalist Inc.', file: 'references/obsidian-api-LICENSE.md', repo: 'https://github.com/obsidianmd/obsidian-api' },
  { label: 'obsidian-bases skill', who: '© 2026 Steph Ango', file: 'references/obsidian-bases-skill-LICENSE', repo: 'https://github.com/kepano/obsidian-skills' },
]

let licWin = null
export function openLicensesWindow() {
  if (licWin && !licWin.isDestroyed()) return licWin.focus()
  const dir = legalDir()
  const href = (f) => esc(pathToFileURL(join(dir, f)).href)
  const listPath = join(dir, 'oss-licenses.json')
  let body
  if (existsSync(listPath)) {
    const list = JSON.parse(readFileSync(listPath, 'utf8'))
    const byName = Object.fromEntries(list.map((p) => [p.name, p]))
    const cards = HIGHLIGHTS.map((h) => {
      const p = byName[h.pkg]
      const meta = h.note || (p ? `${esc(p.license)}${p.version ? ' · v' + esc(p.version) : ''}` : '')
      const repo = p?.repository || h.repo
      return `<div class="card"><div class="hn">${esc(h.label)}</div><div class="hr">${esc(h.role)}</div><div class="hm">${meta}${repo ? ` · <a href="${esc(repo)}" target="_blank">repository</a>` : ''}</div></div>`
    }).join('')
    const refs = REFERENCES.map(
      (r) =>
        `<div class="card"><div class="hn">${esc(r.label)}</div><div class="hr">Reference for the .base format, kept in docs/references/</div><div class="hm">MIT · ${esc(r.who)} · <a href="${href(r.file)}" target="_blank">licence</a> · <a href="${esc(r.repo)}" target="_blank">repository</a></div></div>`,
    ).join('')
    const rows = list
      .map((p) => `<tr><td>${p.repository ? `<a href="${esc(p.repository)}" target="_blank">${esc(p.name)}</a>` : esc(p.name)}</td><td class="m">${esc(p.version)}</td><td class="m">${esc(p.license)}</td></tr>`)
      .join('')
    body =
      `<div class="st">Key components</div><div class="cards">${cards}</div>` +
      `<div class="st">Format references</div><div class="cards">${refs}</div>` +
      `<div class="st">All bundled packages (${list.length})</div>` +
      `<table><thead><tr><th>Package</th><th>Version</th><th>Licence</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="foot">Chromium and Node.js notices: <a href="${href('LICENSES.chromium.html')}" target="_blank">LICENSES.chromium.html</a> · full texts: <a href="${href('THIRD-PARTY-NOTICES.txt')}" target="_blank">THIRD-PARTY-NOTICES.txt</a> · this app: <a href="${href('LICENSE.txt')}" target="_blank">AGPL-3.0-or-later</a></p>`
  } else {
    body = '<div class="missing">The licence notices are generated when the app is packaged.<br>Run <code>npm run legal</code> in the project, then reopen this window.</div>'
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Open Source Licenses</title><style>${STYLE}
  body{display:flex;flex-direction:column}
  header{padding:16px 22px 12px;border-bottom:1px solid var(--line)}
  h1{margin:0;font-size:13px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .sub{margin-top:4px;font-size:12px;color:var(--muted)}
  main{flex:1;overflow-y:auto;padding:2px 22px 24px;-webkit-user-select:text}
  .st{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:20px 0 10px}
  .cards{display:flex;flex-direction:column;gap:8px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:9px 13px}
  .hn{font-weight:600} .hr{font-size:12px;color:var(--muted)} .hm{font-size:11px;color:var(--muted)}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid var(--line);padding:5px 10px;text-align:left;font-size:12px}
  th{color:var(--muted)} td.m{color:var(--muted);white-space:nowrap}
  .foot{margin-top:18px;font-size:11px;color:var(--muted);line-height:1.7}
  .missing{padding:48px 0;text-align:center;color:var(--muted);line-height:1.9}
  code{background:var(--panel);padding:1px 6px;border-radius:3px}
</style>
<header><h1>Open Source Licenses</h1><div class="sub">Scrinotia includes the open-source software below and is implemented, for .base files, from the references listed.</div></header>
<main>${body}</main>
${CLOSE_ON_ESCAPE}`
  licWin = new BrowserWindow({
    width: 760,
    height: 660,
    minWidth: 460,
    minHeight: 360,
    backgroundColor: '#1e1f22',
    title: 'Open Source Licenses',
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  licWin.setMenuBarVisibility(false)
  lockDown(licWin)
  licWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  licWin.on('closed', () => {
    licWin = null
  })
}
