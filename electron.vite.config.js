// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'

// Every process is bundled with its dependencies (only Electron and Node's
// built-ins stay external), so the package needs no node_modules at run time
// and electron-builder leaves them out; see electron-builder.yml.
export default defineConfig({
  main: { build: { externalizeDeps: false } },
  preload: { build: { externalizeDeps: false } },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        // elkjs (EPL-2.0) is replaced by a stub; see src/renderer/src/stubs/elk.js.
        'elkjs/lib/elk.bundled.js': resolve('src/renderer/src/stubs/elk.js'),
      },
    },
  },
})
