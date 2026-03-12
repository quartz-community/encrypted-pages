import { describe, expect, it } from "vitest";
import { EncryptedPages, decrypt } from "../src/transformer";
import { createCtx } from "./helpers";
import type { Root as HastRoot, Element } from "hast";
import { VFile } from "vfile";

/** Helper: create a simple HAST tree with an article containing text. */
function createHastTree(text: string): HastRoot {
  return {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "article",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "p",
            properties: {},
            children: [{ type: "text", value: text }],
          },
        ],
      },
    ],
  };
}

/** Helper: run the transformer's htmlPlugins on a tree + vfile. */
async function runTransformer(
  tree: HastRoot,
  vfile: VFile,
  options: Parameters<typeof EncryptedPages>[0] = {},
) {
  const ctx = createCtx();
  const transformer = EncryptedPages(options);
  const plugins = transformer.htmlPlugins?.(ctx) ?? [];

  // Each plugin is a [pluginFn] or [pluginFn, options] tuple
  for (const pluginEntry of plugins) {
    const pluginFn = Array.isArray(pluginEntry) ? pluginEntry[0] : pluginEntry;
    const attacher = pluginFn as () => (tree: HastRoot, file: VFile) => void;
    const transform = attacher();
    await transform(tree, vfile);
  }

  return { tree, vfile };
}

describe("EncryptedPages transformer", () => {
  it("skips pages without a password in frontmatter", async () => {
    const tree = createHastTree("Hello world");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Public Page" } };

    await runTransformer(tree, vfile);

    // Tree should be unchanged — still has the article
    const article = tree.children[0] as Element;
    expect(article.tagName).toBe("article");
    expect((vfile.data as Record<string, unknown>).encrypted).toBeUndefined();
  });

  it("encrypts pages with a password in frontmatter", async () => {
    const tree = createHastTree("Secret content");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Secret Page", password: "test123" } };

    await runTransformer(tree, vfile);

    // Tree should now contain an encrypted-page container
    const container = tree.children[0] as Element;
    expect(container.tagName).toBe("div");
    expect((container.properties?.className as string[]) ?? []).toContain("encrypted-page");

    // Should have data attributes
    expect(typeof container.properties?.["data-encrypted"]).toBe("string");
    expect(container.properties?.["data-iterations"]).toBe("600000");

    // VFile should be flagged
    expect((vfile.data as Record<string, unknown>).encrypted).toBe(true);
    expect((vfile.data as Record<string, unknown>).text).toBe("");
    expect((vfile.data as Record<string, unknown>).description).toBe("");
  });

  it("can decrypt what it encrypted (roundtrip)", async () => {
    const tree = createHastTree("Roundtrip test content");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: "mypassword" } };

    await runTransformer(tree, vfile);

    const container = tree.children[0] as Element;
    const encryptedData = container.properties?.["data-encrypted"] as string;
    expect(encryptedData).toBeTruthy();

    // Decrypt using the exported decrypt function
    const decrypted = decrypt(encryptedData, "mypassword", 600_000);
    expect(decrypted).toContain("Roundtrip test content");
  });

  it("fails to decrypt with wrong password", async () => {
    const tree = createHastTree("Protected content");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: "correct" } };

    await runTransformer(tree, vfile);

    const container = tree.children[0] as Element;
    const encryptedData = container.properties?.["data-encrypted"] as string;

    expect(() => decrypt(encryptedData, "wrong", 600_000)).toThrow();
  });

  it("respects custom password field name", async () => {
    const tree = createHastTree("Custom field content");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", secret: "pw123" } };

    await runTransformer(tree, vfile, { passwordField: "secret" });

    const container = tree.children[0] as Element;
    expect((container.properties?.className as string[]) ?? []).toContain("encrypted-page");
    expect((vfile.data as Record<string, unknown>).encrypted).toBe(true);
  });

  it("respects custom iteration count", async () => {
    const tree = createHastTree("Custom iterations");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: "pw" } };

    await runTransformer(tree, vfile, { iterations: 1000 });

    const container = tree.children[0] as Element;
    expect(container.properties?.["data-iterations"]).toBe("1000");

    // Verify decryption with the correct iteration count
    const encryptedData = container.properties?.["data-encrypted"] as string;
    const decrypted = decrypt(encryptedData, "pw", 1000);
    expect(decrypted).toContain("Custom iterations");
  });

  it("ignores empty password string", async () => {
    const tree = createHastTree("Not encrypted");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: "" } };

    await runTransformer(tree, vfile);

    const article = tree.children[0] as Element;
    expect(article.tagName).toBe("article");
    expect((vfile.data as Record<string, unknown>).encrypted).toBeUndefined();
  });

  it("ignores non-string password values", async () => {
    const tree = createHastTree("Not encrypted");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: 12345 } };

    await runTransformer(tree, vfile);

    const article = tree.children[0] as Element;
    expect(article.tagName).toBe("article");
    expect((vfile.data as Record<string, unknown>).encrypted).toBeUndefined();
  });

  it("sets visibility metadata on encrypted pages", async () => {
    const tree = createHastTree("Hidden content");
    const vfile = new VFile("");
    vfile.data = { frontmatter: { title: "Test", password: "pw" } };

    await runTransformer(tree, vfile, { visibility: "hidden" });

    expect((vfile.data as Record<string, unknown>).encryptedVisibility).toBe("hidden");
  });
});
