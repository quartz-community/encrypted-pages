import crypto from "node:crypto";
import type { PluggableList, Plugin } from "unified";
import type { Root as HastRoot, Element, ElementContent } from "hast";
import type { VFile } from "vfile";
import { toHtml } from "hast-util-to-html";
import type { QuartzTransformerPlugin } from "@quartz-community/types";
import type { EncryptedPagesOptions } from "./types";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

const defaultOptions: EncryptedPagesOptions = {
  visibility: "icon",
  iterations: 600_000,
  passwordField: "password",
};

/**
 * Encrypts plaintext using AES-256-GCM with PBKDF2 key derivation.
 *
 * Output format (base64-encoded): salt(16) + iv(12) + authTag(16) + ciphertext
 */
function encrypt(plaintext: string, password: string, iterations: number): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([salt, iv, authTag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypts base64-encoded data encrypted by the `encrypt` function above.
 * Used in tests to verify roundtrip correctness.
 */
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
 * Rehype plugin that encrypts the page body when a password is set in frontmatter.
 *
 * The plugin:
 * 1. Checks frontmatter for the configured password field.
 * 2. Serializes the HAST tree to HTML.
 * 3. Encrypts the HTML using AES-256-GCM with PBKDF2 key derivation.
 * 4. Replaces the tree children with a single `<div>` containing encrypted metadata.
 * 5. Sets flags on `file.data` so downstream plugins (filter, emitter) can detect encryption.
 */
const rehypeEncryptedPages = (options: EncryptedPagesOptions): Plugin<[], HastRoot> => {
  return () => (tree: HastRoot, file: VFile) => {
    const frontmatter = (file.data?.frontmatter ?? {}) as Record<string, unknown>;
    const password = frontmatter[options.passwordField];

    if (typeof password !== "string" || password.length === 0) {
      return;
    }

    // Serialize the entire tree to HTML
    const html = toHtml(tree, { allowDangerousHtml: true });

    // Encrypt the HTML content
    const encryptedData = encrypt(html, password, options.iterations);

    // Build the encrypted container element
    const encryptedContainer: Element = {
      type: "element",
      tagName: "div",
      properties: {
        className: ["encrypted-page"],
        "data-encrypted": encryptedData,
        "data-iterations": String(options.iterations),
      },
      children: [],
    };

    // Replace tree children with the encrypted container
    tree.children = [encryptedContainer as ElementContent];

    // Set flags for downstream plugins
    (file.data as Record<string, unknown>).encrypted = true;
    (file.data as Record<string, unknown>).encryptedVisibility = options.visibility;

    // Clear plaintext from file.data to prevent content leakage through search index
    (file.data as Record<string, unknown>).text = "";
    (file.data as Record<string, unknown>).description = "";
  };
};

/**
 * Encrypted pages transformer.
 *
 * Reads a password from the page's frontmatter and encrypts the rendered HTML
 * at build time using AES-256-GCM with PBKDF2 key derivation. The encrypted
 * content is stored as a data attribute and decrypted client-side using the
 * Web Crypto API.
 */
export const EncryptedPages: QuartzTransformerPlugin<Partial<EncryptedPagesOptions>> = (
  userOptions?: Partial<EncryptedPagesOptions>,
) => {
  const options = { ...defaultOptions, ...userOptions };
  return {
    name: "EncryptedPages",
    htmlPlugins(): PluggableList {
      return [rehypeEncryptedPages(options)];
    },
  };
};
