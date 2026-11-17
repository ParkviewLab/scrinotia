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

## Bookmarks: places in a note, remembered by several locators

A bookmark remembers a place inside a file, not just the file: text is selected in a note (in the preview or the source), and a right click offers Bookmark selection. A click on the bookmark later opens the file, scrolls to the remembered words and marks them, as a click on a search result does (R5.1). The selected words also serve as the bookmark's label.

Settled so far:

- A bookmark keeps several locators, and the strongest that still works is used: markers written into the note (where that is safe), the selected words with a few words before and after them (to tell repeats apart), the heading path (such as Plan › Migration), and the position, as a last resort. A bookmark found by a weaker locator can be repaired.
- In a Markdown note, where it is safe, the bookmark writes two markers: a comment pair around the selected words (`%%bm:<name>%%` before, `%%/bm:<name>%%` after), which pins the exact words and survives edits around them; and a block id (`^<name>`) at the end of the paragraph or list item that holds them, reusing one the block already has, which also makes the place a link target for any note (`[[Note#^<name>]]`, `![[Note#^<name>]]`) in Scrinotia and Obsidian alike. Both are hidden in each application's reading view and shown dimmed in Obsidian's editing view (checked in a demo vault, 2026-11-16).
- A marker is not safe, and is not written, inside code (fenced or inline), frontmatter, math, a link or wikilink, or table syntax; a block id is not written where a line cannot end with one (a code block, a table, a heading). There, and in HTML files (read-only, sandboxed, R2.6) and read-only workspaces (R2.8), the bookmark keeps the words, heading and position only. A selection made in the preview is found in the source first; where it crosses formatting, the markers widen to the nearest safe boundary or are skipped.
- The name is derived from the selection, readable rather than random: the first three or four significant words, lower-case letters, digits and hyphens only (the characters both applications accept in a block id), accents removed, under about 30 characters, made unique within the note with `-2`, `-3`; a short random id where nothing usable remains. The comment pair and the block id share the name.
- Deleting a bookmark removes its markers, so that orphaned comments do not accumulate; a marker with no bookmark is ignored.
- A known risk of writing markers: deleting a single `%` of a marker leaves an unclosed `%%`, which hides the text that follows, in both applications.

Open questions: where the bookmark list is kept (proposed: `.scrinotia/bookmarks.json` in the vault, so that bookmarks follow the vault between machines, updated when notes are renamed or moved, as links are, R2.4); how the list is shown (proposed: a Bookmarks choice in the left panel's pull-down beside Files and Tags); whether the mark on opening fades as a search result's does or stays; and whether HTML can be bookmarked and marked at all, since the sandbox hides a selection inside the frame from the page, which the browser engine's text fragments (`#:~:text=`) might work around, untested in this frame. Whether to read Obsidian's own bookmarks file is also open; neither vault in use has one.

Raised 2026-11-16.
