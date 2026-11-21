---
"@quartz-community/encrypted-pages": minor
---

Bases and transclusions in an encrypted note show when it is unlocked (#2). With Quartz 5.2+, the note's content is encrypted again when its page is rendered, once transclusions are inlined and bases filled in; until now the encrypted content held their empty placeholders. Everything else (the note transcluded into other pages, the search index) still only sees the encrypted content. On Quartz 5.1 pages are encrypted as before.
