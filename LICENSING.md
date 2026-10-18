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

## REUSE compliance

This repo is [REUSE](https://reuse.software/)-compliant. Every file has a license via an SPDX header or a `REUSE.toml` annotation. Verify with:

```bash
uvx --from "reuse[charset-normalizer]" reuse lint
```

Any new file needs an SPDX header or a `REUSE.toml` entry, or the lint breaks.
