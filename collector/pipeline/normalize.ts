// RawEntry -> Item with the full schema and neutral intelligence fields (D-02).
import type { SourceConfig } from "../../config/sources";
import type { Item } from "../../src/shared/schema";
import type { RawEntry } from "../adapters/rss";
import { canonicalUrl, idFromUrl } from "./canonical-url";

const TITLE_MAX = 500;
const EXCERPT_MAX = 280;
const ELLIPSIS = "…";

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Truncate on grapheme boundaries; the result (incl. ellipsis) is <= max UTF-16 units. */
export function truncateGraphemes(text: string, max: number): string {
  if (text.length <= max) return text;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let out = "";
  for (const { segment } of segmenter.segment(text)) {
    if (out.length + segment.length > max - ELLIPSIS.length) break;
    out += segment;
  }
  return out.trimEnd() + ELLIPSIS;
}

function toIso(pubDate: string): string | null {
  if (!pubDate.trim()) return null;
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Returns null (never throws) for unusable entries: bad link or empty title. */
export function normalizeEntry(entry: RawEntry, source: SourceConfig, nowIso: string): Item | null {
  const url = canonicalUrl(entry.link);
  if (url === null) return null;
  const title = truncateGraphemes(collapse(entry.title), TITLE_MAX);
  if (title === "") return null;

  const id = idFromUrl(url);
  const publishedAt = toIso(entry.pubDate);
  return {
    id,
    url,
    title,
    excerpt: truncateGraphemes(collapse(entry.description), EXCERPT_MAX),
    lang: source.lang,
    sourceId: source.id,
    company: source.company,
    kind: source.kind,
    publishedAt,
    datePrecision: publishedAt === null ? "none" : "datetime",
    firstSeenAt: nowIso,
    isBackfill: false, // merge decides
    categories: [],
    primaryCategory: null,
    alsoSeenIn: [],
    cluster: { id, isPrimary: true, size: 1, memberIds: [id] },
    score: 0,
    scoreBreakdown: { source: 0, boosts: 0, coverage: 0, penalties: 0, ageDecay: 0 },
    isHighlight: false,
  };
}
