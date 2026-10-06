// Source registry. Phase 1 = exactly one source (D-01). Every URL here was
// verified with a real request (never invent feed URLs).
import type { ItemKind } from "../src/shared/schema";

export type SourceConfig = {
  id: string;
  name: string;
  url: string;
  company: string;
  lang: string;
  kind: ItemKind;
  /** Optional sources never make a run 'failed' on their own. */
  optional: boolean;
};

export const SOURCES: SourceConfig[] = [
  {
    id: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    company: "OpenAI",
    lang: "en",
    kind: "post",
    optional: false,
  },
];
