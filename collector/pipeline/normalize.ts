// RawEntry -> Item with the full schema and neutral intelligence fields (D-02).
import type { SourceConfig } from "../../config/sources";
import { Item } from "../../src/shared/schema";
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

/** The source's own link, trimmed and WHATWG-serialized; null unless http(s). */
function originalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export type NormalizeResult = { ok: true; item: Item } | { ok: false; reason: string };

/**
 * Never throws. Every returned item already passed the zod `Item` schema, so
 * one bad feed entry is dropped (with a reason) at the source boundary instead
 * of aborting the whole run at write time (CR-01).
 */
export function normalizeEntryResult(
  entry: RawEntry,
  source: SourceConfig,
  nowIso: string,
): NormalizeResult {
  // The canonical form only derives the id (dedupe); the reader gets the
  // original link, because canonicalization (www/https/hash/ref) can point to
  // a different or non-existent page (CR-02).
  const canonical = canonicalUrl(entry.link);
  if (canonical === null) return { ok: false, reason: "link is not an absolute http(s) URL" };
  const url = originalUrl(entry.link);
  if (url === null) return { ok: false, reason: "link is not an absolute http(s) URL" };
  const title = truncateGraphemes(collapse(entry.title), TITLE_MAX);
  if (title === "") return { ok: false, reason: "empty title" };

  const id = idFromUrl(canonical);
  const publishedAt = toIso(entry.pubDate);
  const candidate: Item = {
    id,
    url,
    canonicalUrl: canonical,
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
  const parsed = Item.safeParse(candidate);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    return { ok: false, reason: `schema-invalid field(s): ${fields.join(", ")}` };
  }
  return { ok: true, item: parsed.data };
}

/** Returns null (never throws) for unusable or schema-invalid entries. */
export function normalizeEntry(entry: RawEntry, source: SourceConfig, nowIso: string): Item | null {
  const result = normalizeEntryResult(entry, source, nowIso);
  return result.ok ? result.item : null;
}
