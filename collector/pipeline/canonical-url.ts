// Canonical URL + stable id (DATA-01): same article => same id across runs.
import { createHash } from "node:crypto";
import normalizeUrl from "normalize-url";

/** Canonical https URL, or null for non-http(s)/unparseable input (T-01-13). */
export function canonicalUrl(raw: string): string | null {
  const input = raw.trim();
  if (!/^https?:\/\//i.test(input)) return null; // drops javascript:, data:, relative
  try {
    const out = normalizeUrl(input, {
      stripWWW: true,
      removeTrailingSlash: true,
      stripHash: true,
      forceHttps: true,
      sortQueryParameters: true,
      removeQueryParameters: [/^utm_\w+/i, "ref", "fbclid", "gclid"],
    });
    const { protocol } = new URL(out);
    return protocol === "https:" || protocol === "http:" ? out : null;
  } catch {
    return null;
  }
}

export function idFromUrl(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
