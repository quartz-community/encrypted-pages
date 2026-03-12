import { describe, expect, it } from "vitest";
import { EncryptedPageFilter } from "../src/filter";
import { createCtx, createProcessedContent } from "./helpers";

describe("EncryptedPageFilter", () => {
  it("allows non-encrypted pages through", () => {
    const ctx = createCtx();
    const filter = EncryptedPageFilter();
    const content = createProcessedContent({ frontmatter: { title: "Public" } });

    expect(filter.shouldPublish(ctx, content)).toBe(true);
  });

  it("allows encrypted pages through with default visibility (icon)", () => {
    const ctx = createCtx();
    const filter = EncryptedPageFilter();
    const content = createProcessedContent({
      frontmatter: { title: "Secret" },
    });
    // Simulate the transformer setting the encrypted flag
    (content[1].data as Record<string, unknown>).encrypted = true;

    expect(filter.shouldPublish(ctx, content)).toBe(true);
  });

  it("allows encrypted pages through with visible visibility", () => {
    const ctx = createCtx();
    const filter = EncryptedPageFilter({ visibility: "visible" });
    const content = createProcessedContent({
      frontmatter: { title: "Secret" },
    });
    (content[1].data as Record<string, unknown>).encrypted = true;

    expect(filter.shouldPublish(ctx, content)).toBe(true);
  });

  it("blocks encrypted pages with hidden visibility", () => {
    const ctx = createCtx();
    const filter = EncryptedPageFilter({ visibility: "hidden" });
    const content = createProcessedContent({
      frontmatter: { title: "Secret" },
    });
    (content[1].data as Record<string, unknown>).encrypted = true;

    expect(filter.shouldPublish(ctx, content)).toBe(false);
  });

  it("allows non-encrypted pages even with hidden visibility", () => {
    const ctx = createCtx();
    const filter = EncryptedPageFilter({ visibility: "hidden" });
    const content = createProcessedContent({
      frontmatter: { title: "Public" },
    });

    expect(filter.shouldPublish(ctx, content)).toBe(true);
  });
});
