// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
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
