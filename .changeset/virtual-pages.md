---
"@quartz-community/encrypted-pages": minor
---

Encrypts the pages that page types render from files (quartz-community/bases-page#11), through Quartz 5.1's `virtualPageHtmlPlugins`: a drawing stored as Markdown with a `password` in its frontmatter is encrypted like a note, and a `.base`, `.canvas` or `.excalidraw` page, which has no frontmatter, is encrypted with the password of the encrypted published note that links to it (the first by slug when several do). Such pages are also added to the shadow content index when unlisted. Before, these pages were always served in the clear.
