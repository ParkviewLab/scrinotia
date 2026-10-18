# Licensing

Copyright © 2026 Gary Frattarola.

## How this project is licensed

The code is licensed under `AGPL-3.0-or-later`. The full text is in [`LICENSE`](LICENSE) and [`LICENSES/`](LICENSES/).

## Per-bucket licensing

Different kinds of content carry different licenses (encoded in [`REUSE.toml`](REUSE.toml) and per-file SPDX headers):

| Bucket | License |
|---|---|
| Code, build scripts, configs, lockfiles | `AGPL-3.0-or-later` |
| Documentation (`docs/`, `README.md`, this file) | `CC-BY-4.0` |
| Third-party references (`docs/references/obsidian-api/`, `docs/references/obsidian-bases-skill/`) | `MIT`, their own copyright |
| The Scrinotia icon and brand assets (`build/icon.*`, `brand/`) | All rights reserved (`LicenseRef-AllRightsReserved`), not covered by the AGPL |

## Third-party references

[`docs/references/`](docs/references/README.md) holds two MIT-licensed works, copied unchanged with their notices, from which the `.base` support is implemented: the Obsidian API type definitions (© 2022 Dynalist Inc.) and the obsidian-bases skill (© 2026 Steph Ango). They remain under their MIT licences; `REUSE.toml` records them. Scrinotia is independent of Obsidian and not endorsed by it.

## REUSE compliance

This repo is [REUSE](https://reuse.software/)-compliant. Every file has a license via an SPDX header or a `REUSE.toml` annotation. Verify with:

```bash
uvx --from "reuse[charset-normalizer]" reuse lint
```

Any new file needs an SPDX header or a `REUSE.toml` entry, or the lint breaks.
