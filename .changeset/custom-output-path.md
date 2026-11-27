---
"@quartz-community/encrypted-pages": patch
---

A custom `outputPath` for the shadow content index now works: the emitter tells the browser script where it wrote the file, which previously always fetched `static/encryptedContentIndex.json`, so unlocked unlisted pages never appeared in graph, explorer or search. With `unlistWhenEncrypted` on, the build now warns (as documented) when the `EncryptedContentIndex` emitter isn't registered.
