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

## Find inside embedded PDFs and HTML

Find in the open note shipped without this part (R4.7, 2026-10-24): Cmd/Ctrl+F finds in the editor and in the preview's rendered text, embedded notes included. What remains is reaching into what the note embeds: an embedded PDF and an embedded HTML file searched as part of the note, their matches highlighted and stepped through in place; and the same find for a PDF or HTML file opened on its own in the pane.

Open questions: how a match inside an embedded PDF is shown, given that Chromium's PDF viewer has its own find and does not expose its text to the page (which may require rendering PDFs with a library such as pdf.js, Apache-2.0); whether HTML embeds, which are sandboxed without same-origin, can be searched from outside the frame at all, or need the text extracted in the main process (as the vault search already does for HTML) and the highlighting done by a script inside the frame; whether find should also reach `.base` tables.

Raised 2026-10-18; reduced 2026-10-24 when find in the open note shipped.

## The family's documentation as one vault: GitHub links made local

The rest of this idea, opening the directory of every repository as one read-only corpus, shipped as the workspace (R2.8, 2026-10-24): repositories and their worktrees by name, only their notes and `docs/`, `node_modules` and the bare clones neither listed nor watched. What remains is the link mapping. A link of the form `github.com/<owner>/<repo>/blob/<branch>/<path>` would open the local file when the workspace holds that repository's worktree for the branch, and count as a link, so that backlinks cross repositories (open the handbook's `releases.md` and see every README that cites it). Relative Markdown links within a repository are followed already (R4.1).

Open questions: whether the mapping should also cover the documentation sites (`<owner>.github.io/<repo>/...`); which worktree a link to a branch the workspace lacks should open, if any.

Raised 2026-10-19; reduced 2026-10-24 when the workspace shipped.
