---
"@quartz-community/encrypted-pages": patch
---

After an unlisted encrypted page was unlocked, every later navigation dispatched `content-index-updated` and `render` again, re-running other components' setup on each page (a theme toggle that toggled twice, duplicate copy buttons). They are now dispatched only when unlocking actually adds pages to the content index.
