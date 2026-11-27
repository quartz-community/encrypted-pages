import crypto from "node:crypto";
import type { PluggableList, Plugin } from "unified";
import type { Root as HastRoot, Element, ElementContent } from "hast";
import type { VFile } from "vfile";
import { toHtml } from "hast-util-to-html";
import type {
  BuildCtx,
  ProcessedContent,
  QuartzTransformerPlugin,
  TreeTransform,
} from "@quartz-community/types";
import type { EncryptedPagesOptions } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const defaultOptions: EncryptedPagesOptions = {
  iterations: 600_000,
  passwordField: "password",
  unlistWhenEncrypted: false,
};

export function deriveKey(password: string, salt: Buffer, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");
}

export function encryptAesGcm(plaintext: string, password: string, iterations: number): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  return encryptWithKey(plaintext, deriveKey(password, salt, iterations), salt);
}

/**
 * Encrypts with a key already derived from the password and `salt` (a fresh IV each time), in the
 * same format as {@link encryptAesGcm}: salt, IV, auth tag, ciphertext, base64.
 */
export function encryptWithKey(plaintext: string, key: Buffer, salt: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([salt, iv, authTag, encrypted]);
  return result.toString("base64");
}

export function decrypt(encryptedBase64: string, password: string, iterations: number): string {
  const buffer = Buffer.from(encryptedBase64, "base64");

  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
}

/**
 * Passwords of the pages whose rendered body the transformer encrypted without a password in
 * their own frontmatter (a `.base` or `.canvas` page that inherits one), for the
 * {@link EncryptedContentIndex} emitter. Kept out of `file.data`, where a component could show it.
 */
export const inheritedPasswords = new WeakMap<object, string>();

/**
 * `file.data` key of a note's content before encryption, with the key derived from its password,
 * for {@link renderTransforms}: when Quartz 5.2+ renders the note's page, it encrypts the
 * content again once transclusions are inlined and bases filled in (encrypted-pages#2). Everything
 * else (transclusions of the note into other pages, the search index, emitters) only sees the
 * encrypted tree. It is in `file.data` (not a module-level map) because Quartz parses large sites
 * in worker threads; the note's password is in `file.data.frontmatter` anyway.
 */
export const SOURCE_KEY = "encryptedPagesSource";

export interface EncryptedSource {
  tree: HastRoot;
  /** base64 */
  key: string;
  /** base64 */
  salt: string;
  iterations: number;
}

function isEncryptedSource(value: unknown): value is EncryptedSource {
  const source = value as Partial<EncryptedSource> | undefined;
  return (
    !!source &&
    typeof source === "object" &&
    source.tree?.type === "root" &&
    typeof source.key === "string" &&
    typeof source.salt === "string" &&
    typeof source.iterations === "number"
  );
}

function encryptedContainer(encryptedData: string, iterations: number): ElementContent {
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: ["encrypted-page", "popover-hint"],
      "data-encrypted": encryptedData,
      "data-iterations": String(iterations),
    },
    children: [],
  } satisfies Element;
}

function encryptTree(
  tree: HastRoot,
  file: VFile,
  password: string,
  options: EncryptedPagesOptions,
  keepSource = false,
): void {
  const frontmatter = (file.data?.frontmatter ?? {}) as Record<string, unknown>;
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt, options.iterations);
  const data = file.data as Record<string, unknown>;
  if (keepSource) {
    data[SOURCE_KEY] = {
      tree: structuredClone(tree),
      key: key.toString("base64"),
      salt: salt.toString("base64"),
      iterations: options.iterations,
    } satisfies EncryptedSource;
  }

  const html = toHtml(tree, { allowDangerousHtml: true });
  tree.children = [encryptedContainer(encryptWithKey(html, key, salt), options.iterations)];

  data.encrypted = true;
  data.text = "";
  data.description = "";

  const frontmatterUnlisted = frontmatter.unlisted;
  if (typeof frontmatterUnlisted === "boolean") {
    data.unlisted = frontmatterUnlisted;
  } else if (options.unlistWhenEncrypted) {
    data.unlisted = true;
  }

  if (frontmatter.stealth === true) {
    data.stealth = true;
    data.unlisted = true;
  }
}

/**
 * The password a frontmatter value stands for: a string as is, a YAML number (`password: 1234`)
 * as its string form. `undefined` for no password (absent, `null`, `""`).
 */
export function textPassword(value: unknown): string | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function hasPasswordValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * The password of a page with this frontmatter, or `undefined` when it has none. A value that is
 * neither text nor a number (a list, an object, `true`/`false`) must not publish the page in the
 * clear, and its string form (`"true"`, `"a,b"`, `"[object Object]"`) would be easy to guess: the
 * page is encrypted with a random key instead, so it stays locked for everyone, and the build
 * warns.
 */
function passwordIn(
  frontmatter: unknown,
  options: EncryptedPagesOptions,
  file?: VFile,
): string | undefined {
  const value = (frontmatter as Record<string, unknown> | undefined)?.[options.passwordField];
  const password = textPassword(value);
  if (password !== undefined) {
    if (file && typeof value === "number") warnIfNumberLosesDigits(file, options, value);
    return password;
  }
  if (!hasPasswordValue(value)) return undefined;
  if (file) {
    const kind = Array.isArray(value)
      ? "a list"
      : typeof value === "boolean"
        ? "a boolean"
        : "not text";
    console.warn(
      `[encrypted-pages] ${pathOf(file)}: frontmatter "${options.passwordField}" is ${kind}, not a password. ` +
        `The page is published locked and no password opens it; write the password as text (quoted if needed).`,
    );
  }
  return crypto.randomBytes(KEY_LENGTH).toString("base64");
}

function pathOf(file: VFile): string {
  const data = file.data as Record<string, unknown> | undefined;
  return String(data?.relativePath ?? data?.filePath ?? file.path ?? "a page");
}

/**
 * YAML reads `password: 0042` as the number 42, so the page's password is "42". Warn when the
 * value as written in the source differs from that (leading zeros, `1e3`, `0x1F`, long numbers).
 */
function warnIfNumberLosesDigits(file: VFile, options: EncryptedPagesOptions, value: number) {
  const source = typeof file.value === "string" ? file.value : "";
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!frontmatter) return;
  const field = options.passwordField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const raw = frontmatter.match(new RegExp(`^${field}\\s*:[ \\t]*([^\\s#]+)`, "m"))?.[1];
  if (raw === undefined || raw === String(value)) return;
  console.warn(
    `[encrypted-pages] ${pathOf(file)}: frontmatter "${options.passwordField}: ${raw}" is read as the number ${String(value)}, ` +
      `so the page's password is "${String(value)}". Quote it ("${raw}") to use it as written.`,
  );
}

const rehypeEncryptedPages = (options: EncryptedPagesOptions): Plugin<[], HastRoot> => {
  return () => (tree: HastRoot, file: VFile) => {
    const password = passwordIn(file.data?.frontmatter, options, file);
    if (password) encryptTree(tree, file, password, options, true);
  };
};

const pendingRoots = new WeakSet<HastRoot>();

/**
 * Quartz 5.2+ renders transclusions and bases into a page when it renders it, after the
 * transformer phase in which the note was encrypted (encrypted-pages#2). `before` puts the note's
 * content back into its own page's tree (a copy, made for this render), so they are filled in;
 * `after` encrypts the finished content. Other pages, and anything that reads the note's tree,
 * still get the encrypted tree.
 */
export const renderTransforms: { before: TreeTransform[]; after: TreeTransform[] } = {
  before: [
    (root, _slug, componentData) => {
      const source = (componentData.fileData as Record<string, unknown>)[SOURCE_KEY];
      if (!isEncryptedSource(source)) return;
      root.children = structuredClone(source.tree).children;
      pendingRoots.add(root);
    },
  ],
  after: [
    (root, _slug, componentData) => {
      if (!pendingRoots.has(root)) return;
      pendingRoots.delete(root);
      const source = (componentData.fileData as Record<string, unknown>)[SOURCE_KEY];
      if (!isEncryptedSource(source)) {
        // never emit the content we put back in the clear
        root.children = [];
        return;
      }
      const html = toHtml(root, { allowDangerousHtml: true });
      const key = Buffer.from(source.key, "base64");
      const salt = Buffer.from(source.salt, "base64");
      root.children = [encryptedContainer(encryptWithKey(html, key, salt), source.iterations)];
    },
  ],
};

/**
 * Pages that page types render from files (`.base`, `.canvas`, Excalidraw drawings), which
 * Quartz 5.1+ hands to `virtualPageHtmlPlugins` (quartz-community/bases-page#11). A page whose
 * frontmatter has a password (a drawing stored as Markdown) is encrypted with it, like a note.
 * A file without frontmatter (`.base`, `.canvas`, `.excalidraw`) can't hold a password: it is
 * encrypted with the password of the encrypted published pages that link to it (the first by
 * slug when they differ), so a canvas linked from a protected note is protected too. Linked only
 * from unencrypted pages, it stays unencrypted.
 */
const rehypeEncryptedVirtualPages = (
  options: EncryptedPagesOptions,
  content: ProcessedContent[],
): Plugin<[], HastRoot> => {
  const passwordBySlug = new Map<string, string>();
  for (const [, file] of content) {
    const password = passwordIn(file.data?.frontmatter, options);
    if (password && typeof file.data?.slug === "string")
      passwordBySlug.set(file.data.slug, password);
  }

  return () => (tree: HastRoot, file: VFile) => {
    const own = passwordIn(file.data?.frontmatter, options, file);
    if (own) {
      encryptTree(tree, file, own, options);
      return;
    }

    const relativePath = file.data?.relativePath;
    if (typeof relativePath !== "string" || relativePath.toLowerCase().endsWith(".md")) return;
    const referencedBy = (file.data as Record<string, unknown>).referencedBy;
    if (!Array.isArray(referencedBy)) return;
    const inherited = [...referencedBy]
      .filter((slug): slug is string => typeof slug === "string")
      .sort()
      .map((slug) => passwordBySlug.get(slug))
      .find((password) => password !== undefined);
    if (!inherited) return;

    encryptTree(tree, file, inherited, options);
    inheritedPasswords.set(file.data, inherited);
  };
};

let warnedShadowIndexMissing = false;

/**
 * `unlistWhenEncrypted` relies on the EncryptedContentIndex emitter to reveal unlocked pages in
 * graph/explorer/search. Quartz instantiates it from the same config entry; a config that
 * registers only the transformer (TypeScript API) gets a warning, once per process.
 */
function warnIfShadowIndexMissing(ctx: BuildCtx | undefined) {
  if (warnedShadowIndexMissing) return;
  const emitters = (ctx?.cfg as { plugins?: { emitters?: unknown } } | undefined)?.plugins
    ?.emitters;
  if (!Array.isArray(emitters) || emitters.length === 0) return;
  const names = emitters.map((e) => (e as { name?: unknown } | undefined)?.name);
  if (!names.every((name) => typeof name === "string")) return; // can't tell
  if (names.includes("EncryptedContentIndex")) return;
  warnedShadowIndexMissing = true;
  console.warn(
    "[encrypted-pages] unlistWhenEncrypted is on but the EncryptedContentIndex emitter is not registered: " +
      "unlisted encrypted pages won't appear in graph, explorer or search after unlocking.",
  );
}

export const EncryptedPages: QuartzTransformerPlugin<Partial<EncryptedPagesOptions>> = (
  userOptions?: Partial<EncryptedPagesOptions>,
) => {
  const options = { ...defaultOptions, ...userOptions };
  // a variable, not a literal: `virtualPageHtmlPlugins` is newer than the declared types
  const instance: ReturnType<QuartzTransformerPlugin> & {
    virtualPageHtmlPlugins(ctx: BuildCtx, content: ProcessedContent[]): PluggableList;
    renderTransforms(): typeof renderTransforms;
  } = {
    name: "EncryptedPages",
    htmlPlugins(ctx): PluggableList {
      if (options.unlistWhenEncrypted) warnIfShadowIndexMissing(ctx);
      return [rehypeEncryptedPages(options)];
    },
    virtualPageHtmlPlugins(_ctx, content): PluggableList {
      return [rehypeEncryptedVirtualPages(options, content)];
    },
    // Quartz 5.2+; older versions don't call it, and pages stay encrypted as before
    renderTransforms() {
      return renderTransforms;
    },
  };
  return instance;
};
