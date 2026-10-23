# In-flight ideas

*Candidates under consideration for Scrinotia. Each is a question, not a commitment: to research, weigh against the requirements, and either promote to a plan or drop. Nothing here is acted on silently.*

## A render-only canvas viewer

Show `.canvas` files, read-only: no editing of a canvas in this client. A canvas is a JSON Canvas document (the format Obsidian publishes openly at jsoncanvas.org under the MIT licence, so it raises no licensing question): text cards, note and file cards, link cards and groups, placed on a plane and joined by edges.

What the viewer would do:

- Render the whole canvas: cards with their text rendered as Markdown, note cards showing the note, file cards showing the file as the attachment viewer does, groups as labelled regions, and edges with their labels and arrowheads.
- Zoom and pan: wheel or trackpad to zoom about the pointer, drag to pan, and a control to fit the whole canvas to the window.
- A context menu on any card or group (right click): "Zoom to fit" frames that item; for a card that is a note or another canvas in this vault, "Open" opens it in a new tab.

Open questions: how a note card shows a long note (the embedded-note box with Show all, or a fixed card size with scrolling); whether an edge between two note cards should count as a link in backlinks; whether the canvas view should be reachable from the quick switcher and search like any other file.

Raised 2026-10-18.

## Find in the open note and its attachments

Add a find bar (Cmd/Ctrl+F) to the editor and the preview, so that the reader can search for text in the note itself and step through the matches. The search would reach into what the note embeds: an embedded PDF and an embedded HTML file are searched as part of the note, and their matches are highlighted and stepped through in place. The same find bar would serve a PDF or HTML file opened on its own in the pane, as from the attachments folder.

This differs from the vault search (R5.2 to R5.5), which ranks files across the vault; this one finds every occurrence within what is on screen.

Open questions: whether the editor's find (CodeMirror's search panel) and the preview's find should be one bar or two; how a match inside an embedded PDF is shown, given that Chromium's PDF viewer has its own find and does not expose its text to the page (which may require rendering PDFs with a library such as pdf.js, Apache-2.0); whether HTML embeds, which are sandboxed without same-origin, can be searched from outside the frame at all, or need the text extracted in the main process (as the vault search already does for HTML) and the highlighting done by a script inside the frame; whether find should also reach embedded notes and `.base` tables.

Raised 2026-10-18.

## The family's documentation as one vault

Open the directory that holds every ParkviewLab repository (`~/dev/github/`, in the handbook's layout of a bare clone and a worktree per trunk) as a vault, so that the family's documents read as one corpus: every `northstar.md`, `in-flight_ideas.md` and decisions record, every README, searchable together and narrowed by `path:`, with Mermaid and KaTeX rendered and the HTML twins shown beside their Markdown sources. Measured on 2026-10-19: 21 repositories, 272 Markdown files in their `main` worktrees (133 in `docs/`), 15 HTML twins, against 421,552 files in the directory as a whole. No tool reads these documents as one corpus today: the dashboard (hazel-tracking) shows each repository's state, agents read the files one repository at a time, and a person reads them on GitHub one repository at a time. This is the human side of the handbook's idea of an MCP server exposing its documents to agents.

What it would take, each an ordinary vault feature rather than a special mode:

- **Excluded folders:** a per-vault list of patterns (the setting R6.4 already names), applied alike to the file tree, the search index and the file watcher, so that `node_modules`, `.venv`, `out`, `dist`, the bare clones (`<repo>.git`, not a dot-folder) and the `develop` and feature worktrees are neither listed, indexed nor watched. The same setting serves the Smalt's `index/` folder and any vault that holds build output.
- **GitHub links made local:** a link of the form `github.com/<owner>/<repo>/blob/<branch>/<path>` opens the local file when the vault holds that repository's worktree, and counts as a link, so that backlinks cross repositories (open the handbook's `releases.md` and see every README that cites it). Relative Markdown links within a repository are followed already (R4.1).
- **A read-only vault:** a per-vault setting that refuses edits, renames, moves, drops and trashing, since an edit in a `main` worktree is an uncommitted change on a trunk, which the handbook forbids committing directly.
- **Display names:** optionally, the file tree shows `handbook-main` as `handbook`, dropping the worktree suffix.

A `.base` over such a vault needs no frontmatter: `file.folder` and `file.mtime` are enough to list which repositories have a northstar and which `in-flight_ideas.md` changed last.

Open questions: whether the `main` worktrees are the family's documentation (the handbook publishes documents as of the newest release) or `develop` is, or the choice is left to the exclusion patterns; whether the link mapping should also cover the documentation sites (`<owner>.github.io/<repo>/...`); whether a vault setting or a machine setting should hold the exclusions, since `.scrinotia/` would be created in `~/dev/github/`, outside every repository; and whether a read-only vault should still allow `.scrinotia/` settings to be written.

Estimated effort: about a day and a half of agent time, with a scripted check against the real directory.

Raised 2026-10-19.
