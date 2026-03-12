import type { QuartzFilterPlugin, ProcessedContent, BuildCtx } from "@quartz-community/types";
import type { EncryptedPageFilterOptions } from "./types";

const defaultOptions: EncryptedPageFilterOptions = {
  visibility: "icon",
};

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
export const EncryptedPageFilter: QuartzFilterPlugin<Partial<EncryptedPageFilterOptions>> = (
  userOptions?: Partial<EncryptedPageFilterOptions>,
) => {
  const options = { ...defaultOptions, ...userOptions };
  return {
    name: "EncryptedPageFilter",
    shouldPublish(_ctx: BuildCtx, [_tree, vfile]: ProcessedContent) {
      const data = vfile.data as Record<string, unknown>;
      const isEncrypted = data.encrypted === true;

      if (!isEncrypted) {
        return true;
      }

      // "hidden" visibility means encrypted pages are excluded entirely
      if (options.visibility === "hidden") {
        return false;
      }

      // "visible" and "icon" keep the page in the pipeline
      // (plaintext is already stripped by the transformer)
      return true;
    },
  };
};
