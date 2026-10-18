// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
import { contextBridge } from 'electron'
import pkg from '../../package.json'

contextBridge.exposeInMainWorld('granite', { version: pkg.version })
