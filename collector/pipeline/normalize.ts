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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Reject NUL, surrogates and out-of-range code points: keep the literal.
      if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * RSS description / Atom summary often carry HTML: drop script/style bodies,
 * comments and tags (block tags become spaces), then decode entities once.
 * The result is plain text (schema: excerpt is plain text, WR-03). React
 * escapes on render, so decoded '<' is shown literally, never interpreted.
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ");
  return decodeEntities(stripped);
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

/** A publish date further ahead than this is a feed typo, not a real date. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// RFC 822 date with no time part: '[Mon, ]05 Oct 2026'.
const RFC822_DATE_ONLY = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}|\d{2})$/;

/** Noon UTC of a calendar day, or null for an impossible date (e.g. 2026-02-31). */
function noonUtc(year: number, month1: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month1 - 1, day, 12));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month1 - 1 && d.getUTCDate() === day
    ? d
    : null;
}

/**
 * Date-only input → noon UTC of that day, so the day never shifts when shown
 * in UTC (UI-SPEC: day precision renders 'dd/MM/yyyy' in UTC, no time).
 * Returns undefined when the input is not a date-only form.
 */
function parseDateOnly(text: string): Date | null | undefined {
  const iso = ISO_DATE_ONLY.exec(text);
  if (iso) return noonUtc(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const rfc = RFC822_DATE_ONLY.exec(text);
  if (rfc) {
    const month = MONTHS.indexOf(rfc[2].toLowerCase());
    if (month === -1) return null;
    const yy = Number(rfc[3]);
    return noonUtc(rfc[3].length === 2 ? 2000 + yy : yy, month + 1, Number(rfc[1]));
  }
  return undefined;
}

type ParsedDate = { iso: string; precision: "datetime" | "day" } | null;

function toIso(pubDate: string, nowIso: string): ParsedDate {
  const text = pubDate.trim();
  if (!text) return null;
  const dayOnly = parseDateOnly(text);
  const d = dayOnly === undefined ? new Date(text) : dayOnly;
  if (d === null || Number.isNaN(d.getTime())) return null;
  // Future dates (e.g. '2099-10-06') would pin the item to the top forever,
  // and stored items are never re-edited: treat them as unknown, never "now"
  // (WR-01). This also turns year >= 10000 into "no date" instead of a drop.
  if (d.getTime() > Date.parse(nowIso) + FUTURE_TOLERANCE_MS) return null;
  return { iso: d.toISOString(), precision: dayOnly === undefined ? "datetime" : "day" };
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
  const date = toIso(entry.pubDate, nowIso);
  const candidate: Item = {
    id,
    url,
    canonicalUrl: canonical,
    title,
    excerpt: truncateGraphemes(collapse(htmlToText(entry.description)), EXCERPT_MAX),
    lang: source.lang,
    sourceId: source.id,
    company: source.company,
    kind: source.kind,
    publishedAt: date?.iso ?? null,
    datePrecision: date?.precision ?? "none",
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
