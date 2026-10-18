// SPDX-FileCopyrightText: 2026 Gary Frattarola <garyf@parkviewlab.ai>
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Stands in for elkjs, which Mermaid loads only for its optional ELK layout.
// elkjs is EPL-2.0, outside the permissive licences this app ships, so it is
// left out of the bundle and the package; a diagram that asks for the ELK
// layout reports this error, and every other layout works.

export default class ELK {
  layout() {
    return Promise.reject(new Error('The ELK layout is not included in granite-vaulting (elkjs is EPL-2.0, outside the licences this app ships).'))
  }
}
