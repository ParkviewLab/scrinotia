# Scrinotia icon kit

App icon and brand assets for **Scrinotia** (skri·NO·tee·a, "the scroll-case of knowledge"; see [NAME.md](NAME.md)), a markdown vault viewer/editor.

All artwork is generated from `source/generate.py` (pure Python, no dependencies). The SVGs in `source/svg/` are the masters, and every PNG is rendered from them.

## Layout

```
NAME.md                       what "Scrinotia" means, pronunciation, and how it was chosen
source/
  generate.py                 regenerates every SVG:  python3 generate.py out/
  palette.json                the 7 colours
  svg/
    scrinotia-icon.svg             master: rounded tile with margin (docs, README, generic)
    scrinotia-icon-fullbleed.svg   square, no rounding (iOS / web touch icons; the OS masks it)
    scrinotia-icon-macos.svg       on the macOS Big Sur+ grid (824 px body, 100 px inset)
    scrinotia-icon-small.svg       simplified art for 16–32 px (8 spokes, no orbit, no stars)
    scrinotia-icon-macos-small.svg simplified art on the macOS grid
    layers/                       transparent full-canvas layers, back to front
    visionos/                     3-layer stack (back / middle / front)
png/                          scrinotia-icon-{16…1024}.png (16 and 32 use the simplified art)
apple/
  macOS/AppIcon.appiconset    drop into Assets.xcassets (all mac sizes + Contents.json)
  macOS/Scrinotia.icns        for non-Xcode builds (SwiftPM, Tauri, Electron, etc.)
  iOS/AppIcon.appiconset      single-size 1024 universal icon, opaque
  visionOS/AppIcon.solidimagestack   Back / Middle / Front layers for parallax
  icon-composer-layers/       PNG + SVG layers for Xcode 26 Icon Composer (.icon / Liquid Glass)
web/
  favicon.ico (16/32/48), favicon.svg, favicon-16.png, favicon-32.png
  apple-touch-icon.png (180), icon-192.png, icon-512.png, icon-maskable-512.png
  site.webmanifest
brand/
  scrinotia-name-card.png     icon + name + pronunciation (2x)
  github-social-preview.png   1280×640, for the repo's Settings → Social preview
```

## Palette

| Role | Hex |
|---|---|
| Background, midnight | `#0B1226` |
| Spokes, hash fill, cream | `#F2EBDD` |
| Starburst tips, apricot | `#EC8A4E` |
| Centre ball, sky | `#6BB3E0` |
| Orbit dashes and satellite, ultramarine | `#3558B8` |
| Sparkles, gold | `#E0B23A` |
| Hash outline, ink | `#141518` |

## Integration notes

- **Xcode (macOS / iOS / visionOS):** copy the matching `AppIcon.appiconset` or `AppIcon.solidimagestack` into the target's `Assets.xcassets`, replacing the existing `AppIcon`. For a multiplatform target, keep one asset catalog per platform, or merge the `images` arrays into a single `Contents.json`.
- **Xcode 26 / Liquid Glass:** if you adopt Icon Composer, import the layers from `apple/icon-composer-layers/` in numeric order (1 = back). The background layer becomes the glass fill.
- **Web `<head>`:**
  ```html
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#0B1226">
  ```
- **Small sizes:** at 16–32 px the full design turns to noise, so those slots use the simplified art. Keep it that way when regenerating.
- **Regenerating PNGs:** render the SVGs with any SVG renderer (Chromium, `rsvg-convert`, Inkscape) at 1024 and downscale with a high-quality filter.

## Licence

The artwork was made for this project and ships under the repository's licence (AGPL-3.0) unless the maintainer chooses otherwise.
