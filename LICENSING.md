# Licensing

Copyright © 2026 Gary Frattarola.

## How this project is licensed

This project is dual-licensed:

- **Open source:** `AGPL-3.0-or-later`. You may use, modify, and distribute it under those terms. The full text is in [`LICENSE`](LICENSE) and [`LICENSES/`](LICENSES/).
- **Commercial:** if the open-source terms don't fit your use, a commercial license is available. Inquiries: garyf@parkviewlab.ai.

## Per-bucket licensing

Different kinds of content carry different licenses (encoded in [`REUSE.toml`](REUSE.toml) and per-file SPDX headers):

| Bucket | License |
|---|---|
| Code, build scripts, configs, lockfiles | `AGPL-3.0-or-later` |
| Documentation (`docs/`, `README.md`, this file) | `CC-BY-4.0` |
| Third-party references (`docs/references/obsidian-api/`, `docs/references/obsidian-bases-skill/`) | `MIT`, their own copyright |
| The en-US spelling dictionary for Linux (`build/dictionaries/`) | `LicenseRef-SCOWL AND Apache-2.0`, their own copyright |
| The Scrinotia icon and brand assets (`build/icon.*`, `brand/`) | All rights reserved (`LicenseRef-AllRightsReserved`), not covered by the AGPL |

## The name and icon

The name Scrinotia and the Scrinotia icon are used as trademarks of this project (unregistered). They identify the official project and its releases. The AGPL grants rights in the code, not in the name or the icon: a modified version may be distributed under the AGPL's terms, but under another name and with another icon, and must not suggest that it is the official Scrinotia. Stating that a build is based on Scrinotia is permitted. Unmodified releases may be redistributed with the name and icon.

## Third-party references

[`docs/references/`](docs/references/README.md) holds two MIT-licensed works, copied unchanged with their notices, from which the `.base` support is implemented: the Obsidian API type definitions (© 2022 Dynalist Inc.) and the obsidian-bases skill (© 2026 Steph Ango). They remain under their MIT licences; `REUSE.toml` records them. Scrinotia is an independent project, not affiliated with or endorsed by Dynalist Inc.

## The spelling dictionary

[`build/dictionaries/en-US-10-1.bdic`](build/dictionaries/) is Chromium's compiled en-US Hunspell dictionary, copied unchanged from Electron's release, and shipped with the Linux packages so that spell checking needs no download. Its word list comes from SCOWL (© 2000-2018 Kevin Atkinson and the authors its README names), under permissive terms that ask for the notice to be kept; that README is kept verbatim as [`LICENSES/LicenseRef-SCOWL.txt`](LICENSES/LicenseRef-SCOWL.txt). Chromium's dictionary repository, which compiles it, is under the Apache License 2.0. Both texts ship in the packages' `legal/LICENSES/`.

## REUSE compliance

This repo is [REUSE](https://reuse.software/)-compliant. Every file has a license via an SPDX header or a `REUSE.toml` annotation. Verify with:

```bash
uvx --from "reuse[charset-normalizer]" reuse lint
```

Any new file needs an SPDX header or a `REUSE.toml` entry, or the lint breaks.
