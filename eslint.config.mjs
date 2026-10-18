// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['out/', 'dist/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      // Initial ESLint adoption on an existing codebase: unused vars are
      // warnings (not errors) so the gate passes while still flagging real
      // bugs (no-undef, no-unreachable, …). Tighten to "error" once clean.
      'no-unused-vars': 'warn',
      // Deliberate best-effort catches (e.g. localStorage may be unavailable)
      // use empty catch blocks; allow those while still flagging other empties.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/main/**', 'src/preload/**', 'scripts/**', 'electron.vite.config.js', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
]
