export { EncryptedPages } from "./transformer";
export { EncryptedPageFilter } from "./filter";
export { default as EncryptedPage } from "./components/EncryptedPage";

export type { EncryptedPagesOptions, EncryptedPageFilterOptions } from "./types";

export type { EncryptedPageComponentOptions } from "./components/EncryptedPage";

// Re-export shared types from @quartz-community/types
export type {
  QuartzComponent,
  QuartzComponentProps,
  QuartzComponentConstructor,
  StringResource,
  QuartzTransformerPlugin,
  QuartzFilterPlugin,
  QuartzEmitterPlugin,
  QuartzPageTypePlugin,
  QuartzPageTypePluginInstance,
  PageMatcher,
  PageGenerator,
  VirtualPage,
} from "@quartz-community/types";
