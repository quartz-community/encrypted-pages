/**
 * The page is encrypted at build time with node:crypto and decrypted in the browser with Web
 * Crypto by `encrypted.inline.ts`. These tests run the browser script's own decryption code
 * (extracted from the inline script, run against Node's Web Crypto) on what the transformer and
 * the emitter produce, so a format change on one side only (salt / IV / tag layout, KDF, encoding)
 * fails here instead of locking every reader out of every page.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { webcrypto } from "node:crypto";
import type { Root as HastRoot, Element } from "hast";
import { VFile } from "vfile";
import { toHtml } from "hast-util-to-html";
import { EncryptedPages, decrypt, encryptAesGcm } from "../src/transformer";
import { EncryptedContentIndex } from "../src/emitter";
import type { ShadowIndexFile } from "../src/emitter";
import { createCtx } from "./helpers";

const ITERATIONS = 1000;

const inlineSource = readFileSync(
  path.join(import.meta.dirname, "../src/components/scripts/encrypted.inline.ts"),
  "utf8",
);

/** The browser's decryptContent(), as shipped in the inline script. */
const browserDecrypt: (data: string, password: string, iterations: number) => Promise<string> =
  (() => {
    const start = inlineSource.indexOf("const SALT_LENGTH");
    const end = inlineSource.indexOf("function getCachedPasswords");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = inlineSource.slice(start, end);
    return new Function("window", `${body}\nreturn decryptContent;`)({ crypto: webcrypto });
  })();

/** The browser's resolveShadowIndexPath(), against a page whose scripts are `scripts`. */
function browserShadowIndexUrl(scripts: string[], baseURI: string): string {
  const match = inlineSource.match(/function resolveShadowIndexPath\(\) \{[\s\S]*?\n\}/);
  expect(match).not.toBeNull();
  const document = {
    baseURI,
    querySelectorAll: () => scripts.map((textContent) => ({ textContent })),
  };
  return new Function("document", `${match![0]}\nreturn resolveShadowIndexPath();`)(document);
}

function tree(text: string): HastRoot {
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

async function encryptPage(text: string, frontmatter: Record<string, unknown>, options = {}) {
  const root = tree(text);
  const file = new VFile("");
  file.data = { frontmatter } as unknown as VFile["data"];
  const plugins = EncryptedPages({ iterations: ITERATIONS, ...options }).htmlPlugins!(createCtx());
  for (const plugin of plugins as (() => (t: HastRoot, f: VFile) => void)[]) plugin()(root, file);
  return { root, file, container: root.children[0] as Element };
}

describe("browser decryption of build-time encryption", () => {
  it("decrypts a page's ciphertext with the right password", async () => {
    const { container } = await encryptPage("Ünïcode secret ✓", { password: "pa55 wörd" });
    const html = await browserDecrypt(
      container.properties["data-encrypted"] as string,
      "pa55 wörd",
      Number(container.properties["data-iterations"]),
    );
    expect(html).toBe("<article><p>Ünïcode secret ✓</p></article>");
  });

  it("rejects a wrong password (and the build-side decrypt agrees)", async () => {
    const { container } = await encryptPage("secret", { password: "right" });
    const data = container.properties["data-encrypted"] as string;
    await expect(browserDecrypt(data, "wrong", ITERATIONS)).rejects.toThrow();
    await expect(browserDecrypt(data, "right", ITERATIONS + 1)).rejects.toThrow();
    expect(() => decrypt(data, "wrong", ITERATIONS)).toThrow();
  });

  it("rejects a tampered ciphertext (authenticated encryption)", async () => {
    const { container } = await encryptPage("secret", { password: "pw" });
    const bytes = Buffer.from(container.properties["data-encrypted"] as string, "base64");
    bytes[bytes.length - 1]! ^= 0x01;
    const tampered = bytes.toString("base64");
    await expect(browserDecrypt(tampered, "pw", ITERATIONS)).rejects.toThrow();
    expect(() => decrypt(tampered, "pw", ITERATIONS)).toThrow();
  });

  it("uses a fresh salt and IV per page, so equal pages don't produce equal ciphertexts", async () => {
    const a = await encryptPage("same", { password: "pw" });
    const b = await encryptPage("same", { password: "pw" });
    const da = Buffer.from(a.container.properties["data-encrypted"] as string, "base64");
    const db = Buffer.from(b.container.properties["data-encrypted"] as string, "base64");
    expect(da.subarray(0, 16).equals(db.subarray(0, 16))).toBe(false); // salt
    expect(da.subarray(16, 28).equals(db.subarray(16, 28))).toBe(false); // IV
  });

  it("never leaves the plaintext in the page tree, text or description", async () => {
    const { root, file } = await encryptPage("needle-in-the-page", { password: "pw" });
    expect(toHtml(root)).not.toContain("needle");
    expect(file.data.text).toBe("");
    expect(file.data.description).toBe("");
  });

  it("decrypts the page as rendered by Quartz 5.2's renderTransforms", async () => {
    const { root, file } = await encryptPage("intro", { password: "pw" });
    const { before, after } = (
      EncryptedPages() as unknown as {
        renderTransforms(): {
          before: ((r: HastRoot, s: string, c: unknown) => void)[];
          after: ((r: HastRoot, s: string, c: unknown) => void)[];
        };
      }
    ).renderTransforms();
    const page = structuredClone(root);
    const componentData = { fileData: file.data };
    for (const t of before) t(page, "locked", componentData);
    page.children.push({ type: "text", value: "transcluded" });
    for (const t of after) t(page, "locked", componentData);
    const container = page.children[0] as Element;
    const html = await browserDecrypt(
      container.properties["data-encrypted"] as string,
      "pw",
      ITERATIONS,
    );
    expect(html).toBe("<article><p>intro</p></article>transcluded");
  });

  it("decrypts encryptAesGcm output (shadow index format) in the browser", async () => {
    const ciphertext = encryptAesGcm('{"slug":"a"}', "pw", ITERATIONS);
    expect(await browserDecrypt(ciphertext, "pw", ITERATIONS)).toBe('{"slug":"a"}');
  });

  // regression: a YAML number (`password: 1234`) used to be ignored, publishing the page unencrypted
  it("encrypts a page whose frontmatter password is a number (`password: 1234`)", async () => {
    const { file, container } = await encryptPage("PIN-protected", { password: 1234 });
    expect(file.data.encrypted).toBe(true);
    expect(
      await browserDecrypt(container.properties["data-encrypted"] as string, "1234", ITERATIONS),
    ).toContain("PIN-protected");
  });
});

describe("shadow content index, end to end", () => {
  let out: string;
  beforeEach(async () => {
    out = await fs.mkdtemp(path.join(os.tmpdir(), "encpages-client-"));
  });
  afterEach(async () => {
    await fs.rm(out, { recursive: true, force: true });
  });

  async function unlistedEncryptedPage(slug: string, password: string) {
    const { root, file } = await encryptPage("body", {
      title: `Title ${slug}`,
      password,
      tags: ["t"],
      unlisted: true,
    });
    Object.assign(file.data, { slug, relativePath: `${slug}.md`, links: ["other"] });
    return [root, file] as [HastRoot, VFile];
  }

  it("writes entries the browser can decrypt with the page password only", async () => {
    const content = [
      await unlistedEncryptedPage("secret/a", "pw-a"),
      await unlistedEncryptedPage("b", "pw-b"),
    ];
    const [written] = (await EncryptedContentIndex().emit(
      createCtx({ argv: { output: out } }),
      content as never,
      { css: [], js: [], additionalHead: [] },
    )) as string[];
    expect(path.relative(out, written!)).toBe(path.join("static", "encryptedContentIndex.json"));
    const shadow = JSON.parse(await fs.readFile(written!, "utf8")) as ShadowIndexFile;
    expect(shadow.entries).toHaveLength(2);
    // nothing in the clear
    const raw = JSON.stringify(shadow);
    expect(raw).not.toContain("secret/a");
    expect(raw).not.toContain("Title");

    const entry = shadow.entries[0]!;
    expect(entry.iterations).toBe(ITERATIONS);
    const plain = JSON.parse(await browserDecrypt(entry.ciphertext, "pw-a", entry.iterations));
    expect(plain).toEqual({
      slug: "secret/a",
      entry: {
        slug: "secret/a",
        filePath: "secret/a.md",
        title: "Title secret/a",
        links: ["other"],
        tags: ["t"],
        content: "",
        description: "",
      },
    });
    await expect(browserDecrypt(entry.ciphertext, "pw-b", entry.iterations)).rejects.toThrow();
  });

  it("writes the index at a custom outputPath", async () => {
    const [written] = (await EncryptedContentIndex({ outputPath: "data/shadow.json" }).emit(
      createCtx({ argv: { output: out } }),
      [await unlistedEncryptedPage("a", "pw")] as never,
      { css: [], js: [], additionalHead: [] },
    )) as string[];
    expect(written).toBe(path.join(out, "data", "shadow.json"));
    await expect(fs.access(written!)).resolves.toBeUndefined();
  });

  it("the browser fetches the default index next to Quartz's contentIndex.json, under a base path", () => {
    // what Quartz's renderPage emits for a page two folders deep
    const scripts = [
      'const fetchData = fetch("../../static/contentIndex.json").then(r => r.json())',
    ];
    expect(browserShadowIndexUrl(scripts, "https://example.com/sub/a/b/page")).toBe(
      "../../static/encryptedContentIndex.json",
    );
    // without Quartz's script (it failed, or is renamed): relative to the document
    expect(browserShadowIndexUrl([], "https://example.com/sub/page")).toBe(
      "https://example.com/sub/static/encryptedContentIndex.json",
    );
  });

  // bug: the README documents `outputPath` for the emitter, but the client script always fetches
  // `static/encryptedContentIndex.json` (derived from contentIndex.json's URL); nothing tells it
  // the configured path. With a custom outputPath, unlisted pages are never revealed in
  // graph/explorer/search after unlocking.
  it.fails("the browser fetches the shadow index from the configured outputPath", () => {
    const outputPath = "data/shadow.json";
    const scripts = ['const fetchData = fetch("./static/contentIndex.json").then(r => r.json())'];
    expect(browserShadowIndexUrl(scripts, "https://example.com/page")).toMatch(
      new RegExp(`${outputPath}$`),
    );
  });
});

describe("documented details", () => {
  it("keeps embedded raw HTML (iframes, widgets) in the encrypted content", async () => {
    const root = tree("text");
    root.children.push({
      type: "raw",
      value: '<iframe src="https://example.com/x"></iframe>',
    } as never);
    const file = new VFile("");
    file.data = { frontmatter: { password: "pw" } } as unknown as VFile["data"];
    const plugins = EncryptedPages({ iterations: ITERATIONS }).htmlPlugins!(createCtx());
    for (const plugin of plugins as (() => (t: HastRoot, f: VFile) => void)[]) plugin()(root, file);
    const container = root.children[0] as Element;
    const html = await browserDecrypt(
      container.properties["data-encrypted"] as string,
      "pw",
      ITERATIONS,
    );
    expect(html).toContain('<iframe src="https://example.com/x"></iframe>');
  });

  it("encrypts a canvas linked from several encrypted notes with the first note's password by slug", () => {
    const note = (slug: string, password: string) => {
      const file = new VFile("");
      file.data = {
        slug,
        relativePath: `${slug}.md`,
        frontmatter: { password },
      } as unknown as VFile["data"];
      return [{ type: "root", children: [] }, file];
    };
    const content = [note("zeta", "pw-zeta"), note("alpha", "pw-alpha")];
    const plugin = EncryptedPages({ iterations: ITERATIONS }) as unknown as {
      virtualPageHtmlPlugins(
        ctx: unknown,
        content: unknown,
      ): (() => (t: HastRoot, f: VFile) => void)[];
    };
    const root = tree("board");
    const file = new VFile("");
    file.data = {
      relativePath: "Board.canvas",
      referencedBy: ["zeta", "alpha"],
    } as unknown as VFile["data"];
    for (const p of plugin.virtualPageHtmlPlugins(createCtx(), content)) p()(root, file);
    const data = (root.children[0] as Element).properties["data-encrypted"] as string;
    expect(decrypt(data, "pw-alpha", ITERATIONS)).toContain("board");
  });

  it("writes only string tags and links, and an empty title when there is none, to shadow entries", async () => {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), "encpages-shadow-"));
    try {
      const { root, file } = await encryptPage("body", {
        password: "pw",
        unlisted: true,
        tags: ["ok", 3, null],
      });
      Object.assign(file.data, { slug: "a", relativePath: "a.md", links: ["b", 7] });
      const [written] = (await EncryptedContentIndex().emit(
        createCtx({ argv: { output: out } }),
        [[root, file]] as never,
        { css: [], js: [], additionalHead: [] },
      )) as string[];
      const shadow = JSON.parse(await fs.readFile(written!, "utf8")) as ShadowIndexFile;
      const plain = JSON.parse(decrypt(shadow.entries[0]!.ciphertext, "pw", ITERATIONS));
      expect(plain.entry).toMatchObject({ title: "", tags: ["ok"], links: ["b"] });
    } finally {
      await fs.rm(out, { recursive: true, force: true });
    }
  });
});

describe("browser: patching the content index with unlocked shadow entries", () => {
  /** The browser's applyShadowPatches(), against a page whose content index is `index`. */
  function applyShadowPatches(index: Record<string, unknown>) {
    const match = inlineSource.match(/async function applyShadowPatches\(patch\) \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const events: { type: string; detail: unknown }[] = [];
    const document = {
      dispatchEvent: (e: CustomEvent) => events.push({ type: e.type, detail: e.detail }),
    };
    const fn = new Function("document", "fetchData", `${match![0]}\nreturn applyShadowPatches;`)(
      document,
      Promise.resolve(index),
    ) as (patch: Record<string, unknown>) => Promise<void>;
    return { apply: fn, events };
  }

  it("adds newly unlocked pages to the content index and tells graph/explorer/search", async () => {
    const index: Record<string, unknown> = { public: { title: "Public" } };
    const { apply, events } = applyShadowPatches(index);
    await apply({ "secret/a": { title: "A" } });
    expect(index["secret/a"]).toEqual({ title: "A" });
    expect(events).toEqual([
      { type: "content-index-updated", detail: { slugs: ["secret/a"] } },
      { type: "render", detail: null },
    ]);
  });

  // regression: the patch holds every entry unlocked this session (cached ones too) and is applied
  // on every navigation; `render` used to be dispatched each time even when the index already had
  // them all, re-running every component that sets up on `render` (darkmode, reader-mode, ...).
  it("dispatches nothing when the content index already holds every entry", async () => {
    const index: Record<string, unknown> = { "secret/a": { title: "A" } };
    const { apply, events } = applyShadowPatches(index);
    await apply({ "secret/a": { title: "A" } });
    expect(events).toEqual([]);
  });

  it("announces only the entries it added, once, when applied on several navigations", async () => {
    const index: Record<string, unknown> = { "secret/a": { title: "A" } };
    const { apply, events } = applyShadowPatches(index);
    const patch = { "secret/a": { title: "A" }, "secret/b": { title: "B" } };
    await apply(patch); // the unlock
    await apply(patch); // the next navigation
    await apply(patch); // and the one after
    expect(index["secret/b"]).toEqual({ title: "B" });
    expect(events).toEqual([
      { type: "content-index-updated", detail: { slugs: ["secret/b"] } },
      { type: "render", detail: null },
    ]);
  });
});
