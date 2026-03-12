export type {
  BuildCtx,
  ChangeEvent,
  CSSResource,
  JSResource,
  ProcessedContent,
  QuartzEmitterPlugin,
  QuartzEmitterPluginInstance,
  QuartzFilterPlugin,
  QuartzFilterPluginInstance,
  QuartzPluginData,
  QuartzTransformerPlugin,
  QuartzTransformerPluginInstance,
  StaticResources,
  PageMatcher,
  PageGenerator,
  VirtualPage,
  QuartzPageTypePlugin,
  QuartzPageTypePluginInstance,
} from "@quartz-community/types";

/** How encrypted pages appear in graph/explorer/backlinks. */
export type EncryptedPageVisibility = "visible" | "icon" | "hidden";

export interface EncryptedPagesOptions {
  /**
   * How encrypted pages appear in the graph, explorer, and backlinks.
   *
   * - `"visible"` — Title shown normally, content is encrypted.
   * - `"icon"` — Title shown with a lock icon indicator.
   * - `"hidden"` — Completely hidden from graph/explorer.
   *
   * @default "icon"
   */
  visibility: EncryptedPageVisibility;

  /**
   * PBKDF2 iteration count for key derivation.
   * Higher = slower brute-force attacks, but also slower page unlock.
   *
   * @default 600_000
   */
  iterations: number;

  /**
   * Frontmatter field name that holds the page password.
   *
   * @default "password"
   */
  passwordField: string;
}

export interface EncryptedPageFilterOptions {
  /**
   * How encrypted pages appear in content indices (search, RSS, sitemap).
   *
   * - `"visible"` — Page appears in index with title but no content.
   * - `"icon"` — Same as visible (included in index, no content leak).
   * - `"hidden"` — Page is excluded from content index, RSS, and sitemap.
   *
   * @default "icon"
   */
  visibility: EncryptedPageVisibility;
}
