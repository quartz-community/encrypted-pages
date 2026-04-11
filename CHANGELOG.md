# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `EncryptedContentIndex` emitter that writes a versioned shadow content index (`static/encryptedContentIndex.json`) containing opaque encrypted blobs of per-page metadata (slug, title, links, tags) for pages marked `unlisted: true`. The shadow index uses a flat array format so no slugs or titles leak to anonymous visitors.
- `unlistWhenEncrypted` option on the `EncryptedPages` transformer. When `true`, encrypted pages are marked `file.data.unlisted = true`, hiding them from every build-time listing surface that respects the `unlisted` convention (contentIndex, RSS, sitemap, backlinks, recent-notes, folder-page, tag-page, graph, explorer, search) while still emitting the HTML so the page remains accessible by direct URL.
- Per-page `unlisted: true | false` frontmatter override. Explicit `unlisted: false` forces the page listed even when `unlistWhenEncrypted` is set.
- Client-side shadow-index unlocking: on every page load with cached passwords, the client script fetches the shadow index, decrypts entries with cached passwords, patches the resolved `fetchData` object in place, and dispatches `content-index-updated` so graph, explorer, and search re-initialize with the unlocked pages.
- Build-time warning when `unlistWhenEncrypted: true` is set but the companion `EncryptedContentIndex` emitter is not registered.
- `encryptAesGcm`, `decrypt`, and `SHADOW_INDEX_VERSION` exports for test and extension use.
- `ShadowIndexBlob`, `ShadowIndexFile`, and `ShadowContentIndexEntry` type exports.

### Removed

- **Breaking:** `EncryptedPageFilter`. It used Quartz's `shouldPublish` filter mechanism, which removes pages from the entire build (no HTML emitted), directly contradicting the plugin's own README. Use `unlistWhenEncrypted: true` or per-page `unlisted: true` frontmatter instead.
- **Breaking:** `visibility` option on the `EncryptedPages` transformer. It set a `file.data.encryptedVisibility` flag that nothing in the Quartz v5 ecosystem read — the option had no effect.
- **Breaking:** `EncryptedPagesOptions.visibility` type field.
- **Breaking:** `EncryptedPageFilterOptions` type export.

### Changed

- **Breaking:** The shadow content index requires the `EncryptedContentIndex` emitter to be registered. If it is missing but `unlistWhenEncrypted` is `true`, a console warning is logged at build time and unlisted encrypted pages will not be dynamically revealed after client-side decryption.
- Plugin ordering requirement: `EncryptedPages` must run after `CrawlLinks` (or any other transformer that populates `file.data.links`) in the `htmlPlugins` chain. Documented in README.
