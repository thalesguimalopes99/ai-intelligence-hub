// Hand-built items for collector unit tests (no network, no fixtures).
import { createHash } from "node:crypto";
import type { Item } from "@/shared/schema";

export function makeItem(slug: string, publishedAt: string | null, firstSeenAt: string): Item {
  const url = `https://openai.com/index/${slug}`;
  const id = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return {
    id,
    url,
    title: `Title ${slug}`,
    excerpt: "",
    lang: "en",
    sourceId: "openai-news",
    company: "OpenAI",
    kind: "post",
    publishedAt,
    datePrecision: publishedAt === null ? "none" : "datetime",
    firstSeenAt,
    isBackfill: false,
    categories: [],
    primaryCategory: null,
    alsoSeenIn: [],
    cluster: { id, isPrimary: true, size: 1, memberIds: [id] },
    score: 0,
    scoreBreakdown: { source: 0, boosts: 0, coverage: 0, penalties: 0, ageDecay: 0 },
    isHighlight: false,
  };
}
