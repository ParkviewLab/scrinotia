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
