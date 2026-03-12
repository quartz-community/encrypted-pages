# @quartz-community/encrypted-pages

Password-protected encrypted pages for Quartz v5.

## How it works

This plugin uses build-time encryption with AES-256-GCM. Decryption happens on the client side using the Web Crypto API. Key derivation is handled by PBKDF2.

## Installation

```bash
npx quartz plugin add github:quartz-community/encrypted-pages
```

## Usage

Add a `password` field to the frontmatter of any page you want to encrypt.

```yaml
---
title: My Secret Page
password: mysecretpassword
---
```

## Configuration

### quartz.config.ts

Import the plugin and add it to your configuration.

```ts
import * as ExternalPlugin from "./.quartz/plugins";

// In plugins.transformers:
ExternalPlugin.EncryptedPages({
  visibility: "icon",
  iterations: 600000,
  passwordField: "password",
});

// In plugins.filters:
ExternalPlugin.EncryptedPageFilter({ visibility: "icon" });
```

### quartz.config.yaml

If you use the YAML configuration format:

```yaml
- source: github:quartz-community/encrypted-pages
  enabled: true
  options:
    visibility: icon
    iterations: 600000
    passwordField: password
```

### Component

Add the `EncryptedPage` component to your body layout in `quartz.layout.ts`.

## Options

### EncryptedPages (Transformer)

| Option          | Type                              | Default      | Description                                                                                                                                                |
| --------------- | --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visibility`    | `"visible" \| "icon" \| "hidden"` | `"icon"`     | How encrypted pages appear in graph, explorer, and backlinks. `visible` shows them normally. `icon` shows them with a lock indicator. `hidden` hides them. |
| `iterations`    | `number`                          | `600000`     | PBKDF2 iteration count for key derivation. Higher counts are more secure but slower to unlock.                                                             |
| `passwordField` | `string`                          | `"password"` | Frontmatter field name that holds the page password.                                                                                                       |

### EncryptedPageFilter (Filter)

| Option       | Type                              | Default  | Description                                                                                           |
| ------------ | --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `visibility` | `"visible" \| "icon" \| "hidden"` | `"icon"` | Controls whether encrypted pages appear in search, RSS, and sitemap. `hidden` excludes them entirely. |

### EncryptedPage (Component)

| Option      | Type     | Default                    | Description                          |
| ----------- | -------- | -------------------------- | ------------------------------------ |
| `className` | `string` | `"encrypted-page-wrapper"` | CSS class for the component wrapper. |

## Security

- AES-256-GCM encryption with 16-byte salt, 12-byte IV, and 16-byte auth tag.
- PBKDF2 SHA-256 key derivation with 600,000 iterations by default.
- No plaintext leakage. The `file.data.text` and `file.data.description` fields are stripped.
- Passwords are stored per-page in frontmatter. Don't commit these to public repositories.
- Session caching uses `sessionStorage`. It clears when the browser closes.
- This is client-side encryption for a static site. The encrypted HTML is in the page source. This protects against casual browsing but not against a determined attacker with access to the source.

## Password caching

The plugin uses `sessionStorage` to cache passwords. It enables an auto-try behavior when navigating between encrypted pages that share the same password.

## Render event

After a page is decrypted, a `render` CustomEvent is dispatched. Other components like the graph, TOC, and explorer can then re-initialize and display the decrypted content.

## License

MIT
