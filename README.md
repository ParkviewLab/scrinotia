# granite-vaulting

An independent, local-first Markdown notes client for macOS and Ubuntu. It opens a vault (a folder of Markdown notes, such as an existing Obsidian vault) without altering it, and offers a rendered preview, a split source editor, wikilinks with backlinks, search, and table views of `.base` files.

## Status

Version 0.4.0. The requirements are in [`docs/requirements.md`](docs/requirements.md); what this version covers of them:

- **Vaults:** open a folder, recent vaults, several vaults at once with one window each; the file tree hides dot-folders such as `.obsidian/`, which are never read or written.
- **Notes:** a read-only rendered preview, and a split view with the Markdown source on the left and the preview on the right; saving is automatic after an edit, keeps the note's line endings, and never happens merely because a note was opened.
- **Links:** wikilinks (`[[note]]`, `[[note#heading|alias]]`, `![[image.png]]`) and local Markdown links are followed on click; backlinks, unlinked mentions and outgoing links are listed beside the note; renaming or moving a note updates the links that point to it, and nothing else in those notes.
- **Attachments:** images, PDFs, audio, video, text and HTML (scripts sandboxed) are shown in the pane and embedded in notes; other files show their details and open in the system's application.
- **Embedded notes:** `![[Note]]`, `![[Note#Heading]]` and `![[Note#^id]]` show the note, section or block in a box, one level deep, with Show all for long notes.
- **Search:** ranked best match first (BM25+); words (prefixes, and typos in longer words, still match), `"phrases"`, `/regular expressions/`, `-exclusions`, `tag:`, `file:` and `path:`.
- **`.base` files:** table, cards and list views with filters, formulas (the full function library of the references, including dates and durations), note, file and formula properties, sorts, limits, grouping, summaries and display names; a value that cannot be computed is marked in its cell; a base can be edited in the split mode beside its views, and embedded in a note with `![[Name.base]]` or `![[Name.base#View]]`. Requirement R3.6 gives the scope and R3.6.1 the choices made where the references are silent.
- **Settings:** a dark and a light theme, dark by default, kept per vault in `.granite-vaulting/` so that a synchronisation tool such as Syncthing carries it with the vault.


## Install

Download the installer for your system from the repository's [Releases page](https://github.com/garycoding/granite-vaulting/releases).

- **macOS (Apple silicon):** open the `.dmg` and drag granite-vaulting to Applications. The build is not signed, so macOS refuses the first launch; open it once with Control-click, Open, or run `xattr -dr com.apple.quarantine /Applications/granite-vaulting.app`.
- **Ubuntu:** install the `.deb` with `sudo apt install ./granite-vaulting-<version>-amd64.deb`, or make the `.AppImage` executable (`chmod +x`) and run it.
- **Windows:** an unsigned `.exe` installer is built as well; SmartScreen warns on first launch.

## Use

About granite-vaulting and the open-source licences are in the Help menu (and, on macOS, the application menu).

Open a vault from the start screen, or a second vault in a new window (File, New Window, or Cmd/Ctrl+Shift+N). Cmd/Ctrl+O opens the quick switcher: type part of a name and press Enter. Select a note to see its preview. To open a note or link in a new tab, right-click it and choose Open in new tab (or Cmd/Ctrl+click it); Cmd/Ctrl+W closes a tab, and each vault's tabs are restored the next time it opens; choose Edit (split) to change it. The panel on the right shows the note's outline (click a heading to go to it) and lists its backlinks, unlinked mentions and outgoing links. Type in the search box above the file tree to search the vault; Escape clears it. The Tags button above it lists the vault's tags; clicking one searches for it.

## Develop

```bash
npm ci
node node_modules/electron/install.js
npm run dev
```

`npm run lint`, `npm test` and `npm run build` are the checks CI runs; `npm run build:dist` packages installers locally.

## Releasing

Releases are cut from the CLI and published by the tag-driven workflow, as the ParkviewLab handbook's `releases.md` describes.

## Relation to Obsidian

granite-vaulting reads vaults and `.base` files in the formats used by Obsidian, a product of Dynalist Inc. It is an independent project, not affiliated with or endorsed by Obsidian. The `.base` format is implemented from two MIT-licensed references, the Obsidian API type definitions (Dynalist Inc.) and the obsidian-bases skill (Steph Ango), kept in [`docs/references/`](docs/references/README.md).

## Contributing

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). The client is licensed under AGPL-3.0-or-later; see [`LICENSING.md`](LICENSING.md).

---
<sub>© 2026 Gary Frattarola · Licensed under [CC-BY-4.0](LICENSES/CC-BY-4.0.txt)</sub>
