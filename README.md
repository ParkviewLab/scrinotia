# Scrinotia

<img src="build/icon.png" alt="The Scrinotia icon" width="128" align="right">

A local-first, utilitarian Markdown notes client for macOS, Ubuntu and Windows. It opens a vault (a folder of Markdown notes, such as an existing Obsidian vault) without altering it, and offers a rendered preview, a split source editor, wikilinks with backlinks, search, and table views of `.base` files.

## The name

Scrinotia joins two Latin words: *scrinium*, the case in which Romans kept scrolls and documents (the root of English "shrine"), and *notitia*, knowledge and also a record of it. The repeated syllable of *scri-no-ti-tia* is dropped, as Latin itself does in *nutrix* from *nutri-trix*, giving "the scroll-case of knowledge": a vault that holds writing worth keeping.

It is pronounced skri-NO-tee-a (/skrɪˈnoʊ.ti.ə/), with a hard *t* as in classical Latin, not "sha". [`brand/scrinotia-icon-kit/NAME.md`](brand/scrinotia-icon-kit/NAME.md) gives the full account; the project was first called granite-vaulting.

## Status

Version 0.18.0 (versions before 0.7.0 were released as granite-vaulting). The requirements are in [`docs/requirements.md`](docs/requirements.md); what this version covers of them:

- **Vaults:** open a folder, recent vaults, several vaults at once with one window each; the file tree follows each folder's described order (the list in its `00 - <folder>` note; Alphabetical is a setting), lists unlisted files before subfolders, draws lines connecting each item to its folder, and hides dot-folders such as `.obsidian/`, which are never read or written.
- **Notes:** three modes, cycled with Cmd/Ctrl+E: a read-only rendered preview; a split view, the Markdown source on the left and the preview on the right, with a divider that can be dragged and the two panes scrolled together by source line; and the source alone. Saving is automatic after an edit, keeps the note's line endings, and never happens merely because a note was opened. In the preview, task boxes can be ticked, and fenced code is coloured by its language. Print (File, Print…, or Cmd/Ctrl+P) prints the open note as rendered, under its name and in the light theme's colours, without the Properties block.
- **Source editor:** frontmatter shown as YAML; wikilinks, highlights and comments coloured, Markdown's marks dimmed and headings sized by level; completion of notes, headings and block ids after `[[`, and of tags after `#`; Tab and Shift+Tab (or Cmd/Ctrl+] and [) nest and un-nest list items and renumber ordered lists; Cmd/Ctrl+B, I, K, Shift+C and Shift+H for bold, italic, a link, code and a highlight, and Cmd/Ctrl+Enter for a task box; folding of sections, lists and the frontmatter (Cmd/Ctrl+Alt+[ and ], or the marker on the cursor's line); a right-click menu with Cut, Copy, Paste, Follow link and spelling suggestions; Cmd/Ctrl+click follows a link; and an image pasted from the clipboard is saved to `attachments/` and embedded. Spelling is checked in notes (a setting), with the system's dictionaries on macOS and Windows and an English dictionary bundled for Ubuntu, so nothing is downloaded.
- **Links:** wikilinks (`[[note]]`, `[[note#heading|alias]]`, `![[image.png]]`) and local Markdown links are followed on click; backlinks, unlinked mentions and outgoing links are listed beside the note; renaming or moving a note updates the links that point to it, and nothing else in those notes.
- **Dropping files:** drag files onto a note to copy them into `attachments/` and link them; drag a file from the tree or search results to link it; a folder is refused, since a note links to files only.
- **Attachments:** images, PDFs, audio, video, text, HTML (scripts sandboxed) and STL models (a 3D viewer with orbit, zoom and pan, lit from above and to the right of the view with cast shadows, so that relief shows) are shown in the pane and embedded in notes; other files show their details and open in the system's application.
- **Math and diagrams:** `$…$` and `$$…$$` math (KaTeX) and `mermaid` code blocks (Mermaid, without its ELK layout) are rendered in the preview; a diagram pans by dragging and zooms by scrolling, pinching or double-clicking, and its right-click menu offers Zoom to fit and Full screen, as do STL models (Full screen also for HTML files).
- **Embedded notes:** `![[Note]]`, `![[Note#Heading]]` and `![[Note#^id]]` show the note, section or block in a box, one level deep, with Show all for long notes.
- **Search:** ranked best match first (BM25+); words (prefixes, and typos in longer words, still match), `"phrases"`, `/regular expressions/`, `-exclusions`, `tag:`, `file:` and `path:`; the displayed text of HTML attachments is searched too.
- **`.base` files:** table, cards and list views with filters, formulas (the full function library of the references, including dates and durations), note, file and formula properties, sorts, limits, grouping, summaries and display names; a value that cannot be computed is marked in its cell; a base can be edited in the split mode beside its views, and embedded in a note with `![[Name.base]]` or `![[Name.base#View]]`. Requirement R3.6 gives the scope and R3.6.1 the choices made where the references are silent.
- **Settings:** a dark and a light theme, dark by default; and, in the Settings dialog (Cmd/Ctrl+,), the colour of STL models (hue, saturation and lightness) and the fonts of the interface, the preview's body text and headings, and monospaced text, chosen from those installed. All are kept per vault in `.scrinotia/` so that a synchronisation tool such as Syncthing carries them with the vault. A vault's `.granite-vaulting/` folder, from before the rename, is read until the first change of a setting moves it to `.scrinotia/`; recent vaults, tabs and panel widths carry over too.


## Install

Download the installer for your system from the repository's [Releases page](https://github.com/ParkviewLab/scrinotia/releases).

- **macOS (Apple silicon):** open the `.dmg` and drag Scrinotia to Applications. The build is not signed, so macOS refuses the first launch; open it once with Control-click, Open, or run `xattr -dr com.apple.quarantine /Applications/Scrinotia.app`.
- **Ubuntu:** install the `.deb` with `sudo apt install ./scrinotia-<version>-amd64.deb`, or make the `.AppImage` executable (`chmod +x`) and run it.
- **Windows:** run `scrinotia-<version>-setup.exe`. The installer is not signed, so SmartScreen warns on first launch; choose More info, then Run anyway.

## Use

The side panels are drawers: open and close them with the buttons at either end of the note's header or Cmd/Ctrl+\ and Cmd/Ctrl+Shift+\, and drag the bar beside a panel to resize it. About Scrinotia and the open-source licences are in the Help menu (and, on macOS, the application menu); Escape closes either window. Opening About is the only time the app checks GitHub for a newer version, and it says whether one is available.

Open a vault from the start screen, or a second vault in a new window (File, New Window, or Cmd/Ctrl+Shift+N). Cmd/Ctrl+O opens the quick switcher: type part of a name and press Enter. Select a note to see its preview. Each tab has Back and Forward, like a browser tab: the arrows in the note's header (hold one for the list), Cmd+[ and Cmd+] (Alt+Left and Alt+Right on Ubuntu and Windows), the mouse's side buttons, or a trackpad swipe. To open a note or link in a new tab, right-click it and choose Open in new tab (or Cmd/Ctrl+click it); right-clicking a file in the tree or an open tab also offers Reveal in Finder (Show in File Explorer on Windows, Open containing folder on Linux), and an open tab offers Reveal in file tree; Cmd/Ctrl+W closes a tab, and each vault's tabs are restored the next time it opens; choose Edit (split) or Source to change it, or press Cmd/Ctrl+E. The panel on the right shows the note's outline (click a heading to go to it) and lists its backlinks, unlinked mentions and outgoing links. Type in the search box above the file tree to search the vault; Escape clears it. The Tags button above it lists the vault's tags; clicking one searches for it.

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

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). The client is licensed under AGPL-3.0-or-later, and a commercial licence is available; see [`LICENSING.md`](LICENSING.md). The name Scrinotia and its icon identify this project and are not covered by that licence: a modified version must use another name and icon.

---
<sub>© 2026 Gary Frattarola · Licensed under [CC-BY-4.0](LICENSES/CC-BY-4.0.txt)</sub>
