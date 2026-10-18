# In-flight ideas

*Candidates under consideration for granite-vaulting. Each is a question, not a commitment: to research, weigh against the requirements, and either promote to a plan or drop. Nothing here is acted on silently.*

## A render-only canvas viewer

Show `.canvas` files, read-only: no editing of a canvas in this client. A canvas is a JSON Canvas document (the format Obsidian publishes openly at jsoncanvas.org under the MIT licence, so it raises no licensing question): text cards, note and file cards, link cards and groups, placed on a plane and joined by edges.

What the viewer would do:

- Render the whole canvas: cards with their text rendered as Markdown, note cards showing the note, file cards showing the file as the attachment viewer does, groups as labelled regions, and edges with their labels and arrowheads.
- Zoom and pan: wheel or trackpad to zoom about the pointer, drag to pan, and a control to fit the whole canvas to the window.
- A context menu on any card or group (right click): "Zoom to fit" frames that item; for a card that is a note or another canvas in this vault, "Open" opens it in a new tab.

Open questions: how a note card shows a long note (the embedded-note box with Show all, or a fixed card size with scrolling); whether an edge between two note cards should count as a link in backlinks; whether the canvas view should be reachable from the quick switcher and search like any other file.

Raised 2026-10-18.
