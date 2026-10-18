# granite-vaulting: requirements, draft 1

Status: draft for review. Nothing here is design; the technology question is answered only to the extent that a requirement depends on it (see "Open questions").

## Purpose

Version 1 is an independent notes client, not a copy of any other. It opens a local vault (a folder of Markdown notes, including the user's existing vaults) without altering it, and lets the user read and edit the notes in a live-preview Markdown editor, follow wikilinks with backlinks, and search. Its behaviour is specified by this document alone. It runs on macOS and Ubuntu. It is an exploration, not a product.

A second purpose is continuity: a client that the owner controls can be maintained indefinitely, whatever becomes of any commercial product. Two consequences follow for the requirements: the notes must remain plain files readable by any tool (R1.3, R6.3), and the client's own dependencies must be ones that can be kept building for many years (see Q3).

## Definitions

A vault is a directory tree of Markdown notes and attachments. A note is a `.md` file. An attachment is any other file.

## Requirements

### R1. Vault compatibility

R1.1. Opening a vault never modifies any file in it. Writes occur only when the user edits a note, creates, renames, moves, or deletes a file, or changes a vault setting (R6.4).

R1.2. The client never alters or deletes a file it does not understand, including the configuration folders of other programs (such as `.obsidian/`), which it does not read, index, or display. Such files are left byte-identical.

R1.3. Notes are saved as plain UTF-8 Markdown. Frontmatter (YAML between `---` lines) is preserved exactly; an edit to the body never reformats it.

R1.4. Line endings of an existing note are preserved on save.

R1.5. External changes to the vault (another tool, a sync client, another editor) are detected and reflected without restart. When an open note changes on disk and has unsaved edits, the user is told and chooses; edits are never silently discarded or overwritten.

R1.6. The client tolerates a vault of at least 10,000 notes without a perceptible delay in opening it (target: the file tree is usable within 2 seconds on a current laptop; to be confirmed against a real vault).

### R2. Vault browser

R2.1. A vault can be opened from a folder chooser, and recently opened vaults are listed. Several vaults can be open at once, each in its own window; opening a vault that is already open in another window brings that window forward instead.

R2.2. A file tree shows folders, notes, and attachments, with expand and collapse.

R2.3. The user can create, rename, move, and delete notes and folders. Deletion goes to the system trash, not permanent removal.

R2.4. Renaming or moving a note or folder updates the links that point to what moved, in the other notes of the vault, changing only each link's target text. A link elsewhere that the new name would otherwise capture (a nearer or shorter match) is rewritten to keep its previous target. A note changed on disk since it was indexed is left alone and reported.

R2.5. Multiple notes can be open at once, in tabs; a note can be opened from the tree, from a link, from search, and from a quick switcher (fuzzy search over note names). The quick switcher (File, Quick Switcher, Cmd/Ctrl+O) matches the typed characters in order against file names and paths, ranking a match within the file name, an exact or leading name, and matches at word starts first; arrow keys choose, Enter opens, Escape closes. Tabs: each open file has a tab above the pane; a click on a file or link opens it in the current tab, Cmd/Ctrl+click or a middle click in a new tab; a file already open is brought forward; a tab closes with its ×, a middle click, or Cmd/Ctrl+W (Cmd/Ctrl+Shift+W closes the window); Ctrl+Tab and Ctrl+Shift+Tab move between tabs; tabs follow renames and close when their file is deleted. Tabs are per window; each vault's tabs are remembered on the machine (R6.5) and restored when the vault is opened again, leaving out files that no longer exist. A right click on anything that opens a file (a tree item, a link in a note, a backlink, an outgoing link, a search result) offers Open and Open in new tab; a right click on a tab offers Close tab and Close other tabs; Cmd/Ctrl+Enter in the quick switcher opens a new tab.

R2.6. An attachment opens in the pane, and embedded in a note (`![[file]]`) it shows in place: images, PDFs (in the browser engine's PDF viewer), audio and video (with players that can seek), and text-like files (read-only, up to 2 MB) are shown; HTML is rendered in a sandboxed frame whose scripts run in an origin of their own, so they cannot reach the app or read other vault files, and cannot open windows; any other file shows its name, size and modification time, with a button that opens it in the system's default application. No page may open a window of its own. STL models (binary and ASCII) are shown in a 3D viewer with orbit, zoom and pan, in the pane and embedded.

### R3. Live-preview editor

R3.1. A note is shown in one of two modes: a read-only rendered preview, and a split view with the Markdown source editor on the left and the rendered preview on the right, updated as the user types. The preview is the default. (Amended 2026-10-17; it replaces the earlier in-place live preview.)

R3.2. Supported syntax in v1: headings, emphasis, strong, strikethrough, inline code, fenced code blocks, block quotes, ordered, unordered, and task lists (with clickable checkboxes), horizontal rules, tables, links, images, footnotes, inline and block comments (`%%`), highlights (`==`), callouts (`> [!type]`), and frontmatter (shown as a collapsible properties block).

R3.3. Embeds of images and of other notes (`![[...]]`) render in place. Math (`$...$`, `$$...$$`) and Mermaid diagrams are deferred (see "Deferred").

R3.4. Saving is automatic after a short pause in typing. Undo and redo cover the whole editing session of a note.

R3.5. Standard text-editing keyboard behaviour on both platforms (platform-appropriate modifier keys), and list continuation and indentation.

R3.6. A `.base` file is implemented from the two MIT-licensed references in `docs/references/` (the Obsidian API type definitions and the obsidian-bases skill), and from nothing else; the client follows those references, not Obsidian's behaviour. A base opens as its views, one tab per view, and in the split mode its YAML source is edited beside the rendered views, with the same saving and conflict handling as a note. The aim is the whole format the references describe: global and per-view filters; formulas and `formula.*` properties; note, file and formula properties with display names; the functions and value types of the formula language; table, cards and list views with order, sort, limit, groupBy and summaries; and bases embedded in notes. A view type the references name but the client does not provide (such as map) and any expression the client cannot evaluate are reported in the pane, never guessed.

R3.6.1. Where the references are silent, the client chooses as follows. `file.name` includes the extension and `file.basename` omits it, as the API's `TAbstractFile.name` and `TFile.basename` define. A property whose name holds characters other than letters, digits and `_` is written `note["name"]` in an expression; in `order`, `sort`, `groupBy` and `properties` it is written as it stands. Values compare by type: numbers numerically, dates chronologically, text case-insensitively with numbers in text ordered numerically; values of different types are never equal; empty values and errors sort last. An expression that fails for one entry shows a marked cell for that entry only; an entry for which a filter fails is left out of the view, and the view says how many were left out. `file.ctime` is the file's birth time, or, where the filesystem records none, the earlier of its change and modification times. `file.tags` lists tags with their `#`. A duration's `days`, `hours` and the other fields are whole units, truncated towards zero; a month counts as 30.436875 days where a duration mixes months with fixed time. `icon()` is reported as unsupported, since the client bundles no icon set. A column's default label is the property's name without its type prefix. Summaries: a column's summary is computed over the values of the rows shown (after the view's limit), per group and for the whole view; errors are left out of the values; Range gives max minus min for numbers and latest minus earliest for dates; Stddev is the population standard deviation; Empty counts empty text, empty lists and missing values. `list.mean()`, used by the reference's own custom-summary example although its function list omits it, averages the numbers in a list. Groups are ordered by their value in the groupBy direction with the group of entries without a value last, or by `groupOrder` where a view lists one, which then shows only the listed groups. Cards view: one card per entry, the first image among its properties (an image value, or a link to an image file) as the card's picture, the file's own name as its title, the other properties below with their labels. List view: one line per entry, the first property leading and the others after it. Neither view shows summaries. Embedding: `![[Name.base]]` in a note shows the base with its view tabs, and `![[Name.base#View]]` shows that one view; inside an embed, `this` is the embedding note. A fenced code block of base YAML is not supported, since the references do not describe one.

R3.7. An embedded note (`![[Note]]`, `![[Note#Heading]]` for the section under that heading, `![[Note#^id]]` for the paragraph or list item marked `^id`) shows in the preview as a read-only box headed by the note's name, which opens the note. A box taller than about 400 pixels scrolls inside itself and offers Show all and Show less. Only one level is shown: an embed inside an embedded note is a plain link, so a note that embeds itself, directly or through others, is never repeated. A box updates when its note changes on disk. A section or note that cannot be found is reported in the box. Block markers (`^id`) are not shown in the preview.

R3.8. The preview renders math with KaTeX: `$$…$$` as a displayed block and `$…$` inline, where an inline `$` must not be followed by a space nor the closing `$` be preceded by one or followed by a digit, so that prices stay text; an invalid formula shows in red rather than failing the note. A fenced code block marked `mermaid` is drawn as a Mermaid diagram, in the theme's colours and with Mermaid's strict security level; an invalid diagram shows its error in its place. Mermaid's optional ELK layout is not included, because its library (elkjs) is EPL-2.0, outside the permissive licences the app ships; a diagram that asks for it reports so.

### R4. Links and backlinks

R4.1. Wikilinks in all of these forms are recognised, followed, and autocompleted when typed after `[[`: `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`, `[[Note#^block-id]]`, and `[[folder/Note]]`. Ordinary Markdown links to notes (`[text](Note.md)`, with percent-encoding) are followed as well.

R4.2. Resolution uses rules fixed in this project (proposed: case-insensitive name matching, the shortest unambiguous path, and the nearest match when names collide), chosen so that the wikilinks already present in the user's vaults resolve. An unresolved link is displayed distinctly, and activating it offers to create the note.

R4.3. A backlinks panel for the open note lists every note that links to it, with the surrounding line, and also lists unlinked mentions (plain-text occurrences of the note's name).

R4.4. An outgoing-links panel lists the links of the open note.

R4.5. Tags (`#tag`, nested `#a/b`, and the frontmatter `tags` property) are recognised. A Tags pane, switched with Files above the file tree, lists every tag with the number of notes carrying it or a tag nested under it (a note counts once for a parent), nested tags indented under their parents; clicking a tag searches for it.

R4.6. An outline panel lists the headings of the open note, indented by level (frontmatter and fenced code left out), and updates as the note is edited. Clicking a heading scrolls the preview to it and, in the split mode, moves the editor's cursor to its line.

### R5. Search

R5.1. Full-text search across the vault, returning matching notes with context lines and highlighted matches, updating as the vault changes.

R5.2. Search supports plain words (all must match; a word matches by its prefix, and a word of five letters or more also with one or two typos), "quoted phrases" (exact), /regular expressions/ (case-insensitive unless flags say otherwise; an invalid one is reported), exclusion with `-`, and restriction by `tag:`, `file:` and `path:`.

R5.3. The search index is a cache outside the vault, rebuildable at any time from the files, and never the source of truth.

R5.4. Results are ranked by BM25+ (MiniSearch, MIT) over each note's name, tags and text, with the name weighted three times and tags twice the body, best match first; a search without plain words lists its results in path order. The ranked index is kept up to date one note at a time as the vault changes.

R5.5. Search also covers the displayed text of HTML attachments: the page's title and the text of its body, without scripts, styles or markup. Text a page's scripts would add when it runs is not searched, since the page is not run. HTML pages take no part in links, backlinks, tags or `.base` views, and open in the attachment viewer from the results.

### R6. Application

R6.1. Runs on macOS (current and previous major release) and Ubuntu (current LTS), on Apple silicon and x86-64 where the technology allows.

R6.2. A dark and a light theme are provided, and the user chooses between them. The default is the dark theme, whatever the system setting; the choice is a vault-level setting (R6.4).

R6.3. All data stays on the machine. No network access, accounts, telemetry, or update checks in v1.

R6.4. Settings that belong to a vault and change rarely (theme, link-resolution options, folders excluded from indexing, editor preferences) are stored in `.granite-vaulting/` at the root of the vault, so that a file-synchronisation tool carries them to every machine that has the vault. The folder is created only when the user first changes such a setting, never merely on opening a vault. Each concern has its own small JSON file, written atomically, and a synchronisation conflict copy of one file is ignored with a notice, not treated as an error.

R6.5. State specific to one machine (recent vaults, window size and position, open tabs, scroll positions) and all caches, including the search index (R5.3), are stored outside the vault, in the platform's standard location, and are never synchronised through the vault.

R6.6. Installable packages for both platforms are produced from a single build process.

### R7. Licence

R7.1. The client is licensed under AGPL-3.0-or-later; each source file carries the licence identifier, and the repository carries the licence text.

R7.2. Every dependency's licence must be compatible with AGPL-3.0-or-later (permissive licences such as MIT, BSD, ISC, and Apache-2.0 qualify); the dependency list and licences are recorded and checked.

R7.3. The client is specified and written independently; no code, assets, icons, themes, or documentation of any proprietary product are copied. The only third-party descriptions of the vault formats the project uses are the MIT-licensed references in `docs/references/`, kept with their notices. The About dialog, the README and `LICENSING.md` state that granite-vaulting reads the formats used by Obsidian, a product of Dynalist Inc., that it is independent and not affiliated with or endorsed by Obsidian, and that `.base` is implemented from those two references. (Provenance note: the first `.base` subset, in v0.1.1, was written from two example files and from prior knowledge of the format, not from any document read for the purpose.)

## Deferred beyond v1

Graph view, canvas, plugins and themes, publish and sync, mobile, math and Mermaid rendering, templates and daily notes, web clipper, and PDF rendering. Their absence in v1 must not break any data of theirs that is present in a vault: R1.2 covers it.

## Open questions

Q1. Resolved: the client is not a copy, and the requirements define the behaviour themselves. Amended 2026-10-18: for `.base` only, the two MIT-licensed references in `docs/references/` are the source; Obsidian's help site, which carries no licence, is not consulted.

Q2. Resolved: the client neither reads nor writes `.obsidian/` or any comparable folder (R1.2). Vault-level settings live in `.granite-vaulting/` inside the vault; machine-specific state and caches live outside it (R6.4, R6.5).

Q3. Resolved: Electron, with CodeMirror 6 for the editor; Node tooling is accepted for this exploration. The reasoning that led to it follows.

Technology, stated only as it bears on the requirements. R3.1 (live preview) is the hard requirement. CodeMirror 6 is a mature web-based editor that supports it; a Rust+eframe client has no equivalent and would need a Markdown editing widget written from scratch, which is the largest single piece of work in the project. Electron (or another web-view shell) therefore makes v1 materially easier, at the cost of installed size and memory, and of introducing Node tooling into the exploration. I recommend Electron; this wants your ruling because of your standing preference against extra tooling languages.

Q4. Resolved: the repository is created private under garycoding and made public only on your instruction, and it follows the ParkviewLab handbook's conventions. It may later move to the ParkviewLab organisation, so it is built to transfer cleanly: nothing in it may depend on the garycoding account, and its documentation, workflows, and licence are those the handbook prescribes.

Q5. Resolved: the repository carries a synthetic vault, built to cover the cases deliberately, for automated tests. When a real corpus is needed, a copy of `/Users/gary/dev/ObsidianVaults/LibraryVault` is made outside the repository and used read-only by hand; its content is never committed.
