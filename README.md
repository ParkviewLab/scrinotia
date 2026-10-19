# Scrinotia

<img src="build/icon.png" alt="The Scrinotia icon" width="128" align="right">

A local-first, utilitarian Markdown notes client for macOS and Ubuntu. It opens a vault (a folder of Markdown notes, such as an existing Obsidian vault) without altering it, and offers a rendered preview, a split source editor, wikilinks with backlinks, search, and table views of `.base` files.

## The name

Scrinotia joins two Latin words: *scrinium*, the case in which Romans kept scrolls and documents (the root of English "shrine"), and *notitia*, knowledge and also a record of it. The repeated syllable of *scri-no-ti-tia* is dropped, as Latin itself does in *nutrix* from *nutri-trix*, giving "the scroll-case of knowledge": a vault that holds writing worth keeping.

It is pronounced skri-NO-tee-a (/skrɪˈnoʊ.ti.ə/), with a hard *t* as in classical Latin, not "sha". [`brand/scrinotia-icon-kit/NAME.md`](brand/scrinotia-icon-kit/NAME.md) gives the full account; the project was first called granite-vaulting.

## Status

Version 0.14.0 (versions before 0.7.0 were released as granite-vaulting). The requirements are in [`docs/requirements.md`](docs/requirements.md); what this version covers of them:

- **Vaults:** open a folder, recent vaults, several vaults at once with one window each; the file tree lists each folder's files before its subfolders, with lines connecting each item to its folder, and hides dot-folders such as `.obsidian/`, which are never read or written.
- **Notes:** a read-only rendered preview, and a split view with the Markdown source on the left and the preview on the right; saving is automatic after an edit, keeps the note's line endings, and never happens merely because a note was opened.
- **Links:** wikilinks (`[[note]]`, `[[note#heading|alias]]`, `![[image.png]]`) and local Markdown links are followed on click; backlinks, unlinked mentions and outgoing links are listed beside the note; renaming or moving a note updates the links that point to it, and nothing else in those notes.
- **Dropping files:** drag files onto a note to copy them into `attachments/` and link them; drag a file from the tree or search results to link it.
- **Attachments:** images, PDFs, audio, video, text, HTML (scripts sandboxed) and STL models (a 3D viewer with orbit, zoom and pan, lit from above and to the right of the view with cast shadows, so that relief shows) are shown in the pane and embedded in notes; other files show their details and open in the system's application.
- **Math and diagrams:** `$…$` and `$$…$$` math (KaTeX) and `mermaid` code blocks (Mermaid, without its ELK layout) are rendered in the preview.
- **Embedded notes:** `![[Note]]`, `![[Note#Heading]]` and `![[Note#^id]]` show the note, section or block in a box, one level deep, with Show all for long notes.
- **Search:** ranked best match first (BM25+); words (prefixes, and typos in longer words, still match), `"phrases"`, `/regular expressions/`, `-exclusions`, `tag:`, `file:` and `path:`; the displayed text of HTML attachments is searched too.
- **`.base` files:** table, cards and list views with filters, formulas (the full function library of the references, including dates and durations), note, file and formula properties, sorts, limits, grouping, summaries and display names; a value that cannot be computed is marked in its cell; a base can be edited in the split mode beside its views, and embedded in a note with `![[Name.base]]` or `![[Name.base#View]]`. Requirement R3.6 gives the scope and R3.6.1 the choices made where the references are silent.
- **Settings:** a dark and a light theme, dark by default; and, in the Settings dialog (Cmd/Ctrl+,), the colour of STL models (hue, saturation and lightness) and the fonts of the interface, the preview's body text and headings, and monospaced text, chosen from those installed. All are kept per vault in `.scrinotia/` so that a synchronisation tool such as Syncthing carries them with the vault. A vault's `.granite-vaulting/` folder, from before the rename, is read until the first change of a setting moves it to `.scrinotia/`; recent vaults, tabs and panel widths carry over too.


## Install

Download the installer for your system from the repository's [Releases page](https://github.com/garycoding/scrinotia/releases).

- **macOS (Apple silicon):** open the `.dmg` and drag Scrinotia to Applications. The build is not signed, so macOS refuses the first launch; open it once with Control-click, Open, or run `xattr -dr com.apple.quarantine /Applications/Scrinotia.app`.
- **Ubuntu:** install the `.deb` with `sudo apt install ./scrinotia-<version>-amd64.deb`, or make the `.AppImage` executable (`chmod +x`) and run it.
- **Windows:** an unsigned `.exe` installer is built as well; SmartScreen warns on first launch.

## Use

The side panels are drawers: open and close them with the buttons at either end of the note's header or Cmd/Ctrl+\ and Cmd/Ctrl+Shift+\, and drag the bar beside a panel to resize it. About Scrinotia and the open-source licences are in the Help menu (and, on macOS, the application menu); Escape closes either window. Opening About is the only time the app checks GitHub for a newer version, and it says whether one is available.

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

Scrinotia reads vaults and `.base` files in the formats used by Obsidian, a product of Dynalist Inc. Scrinotia is an independent project, not affiliated with or endorsed by Dynalist Inc. The `.base` file format is implemented from two MIT-licensed references, the Obsidian API type definitions (Dynalist Inc.) and the obsidian-bases skill (Steph Ango), kept in [`docs/references/`](docs/references/README.md).

## Contributing

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). The client is licensed under AGPL-3.0-or-later; see [`LICENSING.md`](LICENSING.md). The name Scrinotia and its icon identify this project and are not covered by that licence: a modified version must use another name and icon.

---
<sub>© 2026 Gary Frattarola · Licensed under [CC-BY-4.0](LICENSES/CC-BY-4.0.txt)</sub>
