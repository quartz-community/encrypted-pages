---
"@quartz-community/encrypted-pages": minor
---

Requires Quartz 5.1 (`quartz.quartzVersion: ">=5.1.0"`): it encrypts `.base`, `.canvas` and drawing pages through `virtualPageHtmlPlugins` and `file.data.referencedBy`; on Quartz 5.0 those pages would be published unencrypted. On an older Quartz the build warns, and fails in CI; update Quartz with `npx quartz upgrade`.
