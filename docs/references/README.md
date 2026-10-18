# References for the .base format

The `.base` support (requirement R3.6) is implemented from these two MIT-licensed works, copied here unchanged with their licence notices so that the project keeps its own copy. Nothing else is used as a source for the format: Obsidian's help site is not consulted, since it carries no licence.

| Folder | Work | Copyright | Licence | Source and commit |
|---|---|---|---|---|
| `obsidian-api/` | `obsidian.d.ts`, the Obsidian API type definitions; the format is described by `BasesConfigFile` and its related types, and the formula language by the `Value` classes | 2022 Dynalist Inc. | MIT (`obsidian-api/LICENSE.md`) | github.com/obsidianmd/obsidian-api at `9abd9605ce081383674aae1ed111c456edde0688` (package version 1.14.4) |
| `obsidian-bases-skill/` | `SKILL.md` and `FUNCTIONS_REFERENCE.md`, the obsidian-bases agent skill | 2026 Steph Ango | MIT (`obsidian-bases-skill/LICENSE`) | github.com/kepano/obsidian-skills, `skills/obsidian-bases` at `9b736ba8da230341054cc668bedc0bcb041baa98` |

Where the two differ or are silent, the implementation chooses and the choice is recorded in R3.6. The client's behaviour is defined by these references, not by any comparison with Obsidian.

To update a reference, replace the file from its source at a newer commit, record the commit in this table, and note in the pull request what changed in the format.
