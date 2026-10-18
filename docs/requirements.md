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

R2.5. Multiple notes can be open at once, in tabs; a note can be opened from the tree, from a link, from search, and from a quick switcher (fuzzy search over note names).

### R3. Live-preview editor

R3.1. A note is shown in one of two modes: a read-only rendered preview, and a split view with the Markdown source editor on the left and the rendered preview on the right, updated as the user types. The preview is the default. (Amended 2026-10-17; it replaces the earlier in-place live preview.)

R3.2. Supported syntax in v1: headings, emphasis, strong, strikethrough, inline code, fenced code blocks, block quotes, ordered, unordered, and task lists (with clickable checkboxes), horizontal rules, tables, links, images, footnotes, inline and block comments (`%%`), highlights (`==`), callouts (`> [!type]`), and frontmatter (shown as a collapsible properties block).

R3.3. Embeds of images and of other notes (`![[...]]`) render in place. Math (`$...$`, `$$...$$`) and Mermaid diagrams are deferred (see "Deferred").

R3.4. Saving is automatic after a short pause in typing. Undo and redo cover the whole editing session of a note.

R3.5. Standard text-editing keyboard behaviour on both platforms (platform-appropriate modifier keys), and list continuation and indentation.

R3.6. A `.base` file opens as a set of table views of the vault's notes, one tab per view. Supported: filters as expressions combined with and, or and not; comparisons, `!`, `&&`, `||`; `file.name`, `file.ext`, `file.path`, `file.folder`, `file.inFolder()`, `file.hasTag()`, `file.hasLink()` and frontmatter properties; table views with order, sort, limit and display names. Anything else is reported in the pane, not guessed. Clicking a note's name opens it.

### R4. Links and backlinks

R4.1. Wikilinks in all of these forms are recognised, followed, and autocompleted when typed after `[[`: `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`, `[[Note#^block-id]]`, and `[[folder/Note]]`. Ordinary Markdown links to notes (`[text](Note.md)`, with percent-encoding) are followed as well.

R4.2. Resolution uses rules fixed in this project (proposed: case-insensitive name matching, the shortest unambiguous path, and the nearest match when names collide), chosen so that the wikilinks already present in the user's vaults resolve. An unresolved link is displayed distinctly, and activating it offers to create the note.

R4.3. A backlinks panel for the open note lists every note that links to it, with the surrounding line, and also lists unlinked mentions (plain-text occurrences of the note's name).

R4.4. An outgoing-links panel lists the links of the open note.

R4.5. Tags (`#tag`, nested `#a/b`, and the frontmatter `tags` property) are recognised and listed in a tag pane; selecting a tag shows the notes that carry it.

R4.6. An outline panel lists the headings of the open note and moves the cursor to the one chosen.

### R5. Search

R5.1. Full-text search across the vault, returning matching notes with context lines and highlighted matches, updating as the vault changes.

R5.2. Search supports plain words, quoted phrases, exclusion, and restriction by tag, by file name, and by path. Regular expressions and further operators are open for decision.

R5.3. The search index is a cache outside the vault, rebuildable at any time from the files, and never the source of truth.

### R6. Application

R6.1. Runs on macOS (current and previous major release) and Ubuntu (current LTS), on Apple silicon and x86-64 where the technology allows.

R6.2. A dark and a light theme are provided, and the user chooses between them. The default is the dark theme, whatever the system setting; the choice is a vault-level setting (R6.4), and is held until then for the session only.

R6.3. All data stays on the machine. No network access, accounts, telemetry, or update checks in v1.

R6.4. Settings that belong to a vault and change rarely (theme, link-resolution options, folders excluded from indexing, editor preferences) are stored in `.granite-vaulting/` at the root of the vault, so that a file-synchronisation tool carries them to every machine that has the vault. The folder is created only when the user first changes such a setting, never merely on opening a vault. Each concern has its own small JSON file, written atomically, and a synchronisation conflict copy of one file is ignored with a notice, not treated as an error.

R6.5. State specific to one machine (recent vaults, window size and position, open tabs, scroll positions) and all caches, including the search index (R5.3), are stored outside the vault, in the platform's standard location, and are never synchronised through the vault.

R6.6. Installable packages for both platforms are produced from a single build process.

### R7. Licence

R7.1. The client is licensed under AGPL-3.0-or-later; each source file carries the licence identifier, and the repository carries the licence text.

R7.2. Every dependency's licence must be compatible with AGPL-3.0-or-later (permissive licences such as MIT, BSD, ISC, and Apache-2.0 qualify); the dependency list and licences are recorded and checked.

R7.3. The client is specified and written independently; no code, assets, icons, themes, or documentation of any proprietary product are copied.

## Deferred beyond v1

Graph view, canvas, plugins and themes, publish and sync, mobile, math and Mermaid rendering, templates and daily notes, web clipper, and PDF rendering. Their absence in v1 must not break any data of theirs that is present in a vault: R1.2 covers it.

## Open questions

Q1. Resolved: the client is not a copy, and the requirements define the behaviour themselves.

Q2. Resolved: the client neither reads nor writes `.obsidian/` or any comparable folder (R1.2). Vault-level settings live in `.granite-vaulting/` inside the vault; machine-specific state and caches live outside it (R6.4, R6.5).

Q3. Resolved: Electron, with CodeMirror 6 for the editor; Node tooling is accepted for this exploration. The reasoning that led to it follows.

Technology, stated only as it bears on the requirements. R3.1 (live preview) is the hard requirement. CodeMirror 6 is a mature web-based editor that supports it; a Rust+eframe client has no equivalent and would need a Markdown editing widget written from scratch, which is the largest single piece of work in the project. Electron (or another web-view shell) therefore makes v1 materially easier, at the cost of installed size and memory, and of introducing Node tooling into the exploration. I recommend Electron; this wants your ruling because of your standing preference against extra tooling languages.

Q4. Resolved: the repository is created private under garycoding and made public only on your instruction, and it follows the ParkviewLab handbook's conventions. It may later move to the ParkviewLab organisation, so it is built to transfer cleanly: nothing in it may depend on the garycoding account, and its documentation, workflows, and licence are those the handbook prescribes.

Q5. Resolved: the repository carries a synthetic vault, built to cover the cases deliberately, for automated tests. When a real corpus is needed, a copy of `/Users/gary/dev/ObsidianVaults/LibraryVault` is made outside the repository and used read-only by hand; its content is never committed.
