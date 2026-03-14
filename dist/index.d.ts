import { QuartzTransformerPlugin, QuartzFilterPlugin } from '@quartz-community/types';
export { PageGenerator, PageMatcher, QuartzComponent, QuartzComponentConstructor, QuartzComponentProps, QuartzEmitterPlugin, QuartzFilterPlugin, QuartzPageTypePlugin, QuartzPageTypePluginInstance, QuartzTransformerPlugin, StringResource, VirtualPage } from '@quartz-community/types';
import { EncryptedPagesOptions, EncryptedPageFilterOptions } from './types.js';
export { EncryptedPage, EncryptedPageComponentOptions } from './components/index.js';

/**
 * Encrypted pages transformer.
 *
 * Reads a password from the page's frontmatter and encrypts the rendered HTML
 * at build time using AES-256-GCM with PBKDF2 key derivation. The encrypted
 * content is stored as a data attribute and decrypted client-side using the
 * Web Crypto API.
 */
declare const EncryptedPages: QuartzTransformerPlugin<Partial<EncryptedPagesOptions>>;

/**
 * Filter that controls whether encrypted pages appear in the content pipeline.
 *
 * When `visibility` is `"hidden"`, encrypted pages are removed from the content
 * array before emitters run, so they won't appear in contentIndex.json, RSS,
 * or sitemap. The page HTML is still emitted (by the static-content emitter),
 * but search/graph/explorer won't reference it.
 *
 * When `visibility` is `"visible"` or `"icon"`, encrypted pages remain in the
 * pipeline. The transformer already strips `text` and `description` from file.data,
 * so the content index won't leak plaintext.
 */
declare const EncryptedPageFilter: QuartzFilterPlugin<Partial<EncryptedPageFilterOptions>>;

export { EncryptedPageFilter, EncryptedPageFilterOptions, EncryptedPages, EncryptedPagesOptions };
