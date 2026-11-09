import crypto from "node:crypto";
import type { PluggableList, Plugin } from "unified";
import type { Root as HastRoot, Element, ElementContent } from "hast";
import type { VFile } from "vfile";
import { toHtml } from "hast-util-to-html";
import type { BuildCtx, ProcessedContent, QuartzTransformerPlugin } from "@quartz-community/types";
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

export function encryptAesGcm(plaintext: string, password: string, iterations: number): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");

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

function encryptTree(
  tree: HastRoot,
  file: VFile,
  password: string,
  options: EncryptedPagesOptions,
): void {
  const frontmatter = (file.data?.frontmatter ?? {}) as Record<string, unknown>;
  const html = toHtml(tree, { allowDangerousHtml: true });

  const encryptedData = encryptAesGcm(html, password, options.iterations);

  const encryptedContainer: Element = {
    type: "element",
    tagName: "div",
    properties: {
      className: ["encrypted-page", "popover-hint"],
      "data-encrypted": encryptedData,
      "data-iterations": String(options.iterations),
    },
    children: [],
  };

  tree.children = [encryptedContainer as ElementContent];

  const data = file.data as Record<string, unknown>;
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

function passwordIn(frontmatter: unknown, options: EncryptedPagesOptions): string | undefined {
  const password = (frontmatter as Record<string, unknown> | undefined)?.[options.passwordField];
  return typeof password === "string" && password.length > 0 ? password : undefined;
}

const rehypeEncryptedPages = (options: EncryptedPagesOptions): Plugin<[], HastRoot> => {
  return () => (tree: HastRoot, file: VFile) => {
    const password = passwordIn(file.data?.frontmatter, options);
    if (password) encryptTree(tree, file, password, options);
  };
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
    const own = passwordIn(file.data?.frontmatter, options);
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

export const EncryptedPages: QuartzTransformerPlugin<Partial<EncryptedPagesOptions>> = (
  userOptions?: Partial<EncryptedPagesOptions>,
) => {
  const options = { ...defaultOptions, ...userOptions };
  // a variable, not a literal: `virtualPageHtmlPlugins` is newer than the declared types
  const instance: ReturnType<QuartzTransformerPlugin> & {
    virtualPageHtmlPlugins(ctx: BuildCtx, content: ProcessedContent[]): PluggableList;
  } = {
    name: "EncryptedPages",
    htmlPlugins(): PluggableList {
      return [rehypeEncryptedPages(options)];
    },
    virtualPageHtmlPlugins(_ctx, content): PluggableList {
      return [rehypeEncryptedVirtualPages(options, content)];
    },
  };
  return instance;
};
