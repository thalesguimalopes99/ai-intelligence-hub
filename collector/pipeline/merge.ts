// Idempotent merge (PIPE-04): union by id, stored items win (firstSeenAt and
// isBackfill never change; no re-edit churn, Pitfall 5), 30-day window, sorted.
// Sole exception: the one-time CR-02 upgrade of legacy items (url/canonicalUrl).
import { WINDOW_DAYS } from "../../src/shared/constants";
import type { Item } from "../../src/shared/schema";
import { sortItems } from "../../src/shared/serialize";

const DAY_MS = 24 * 60 * 60 * 1000;

export type MergeOptions = {
  /** True when the source has never had a successful run (its items are backfill). */
  sourceFirstRun: boolean;
};

export function mergeItems(
  prev: Item[],
  fresh: Item[],
  nowIso: string,
  opts: MergeOptions,
): Item[] {
  const byId = new Map<string, Item>();
  for (const item of prev) byId.set(item.id, item);
  for (const item of fresh) {
    const stored = byId.get(item.id);
    if (stored !== undefined) {
      // One-time upgrade of items written before CR-02 (no canonicalUrl, url =
      // canonical form): take the original link from the feed. Everything else
      // stays as stored, and upgraded items are stable on later runs.
      if (stored.canonicalUrl === undefined && item.canonicalUrl !== undefined) {
        byId.set(item.id, { ...stored, url: item.url, canonicalUrl: item.canonicalUrl });
      }
      continue;
    }
    byId.set(item.id, { ...item, isBackfill: opts.sourceFirstRun });
  }

  const cutoff = Date.parse(nowIso) - WINDOW_DAYS * DAY_MS;
  const windowed = [...byId.values()].filter(
    (item) => Date.parse(item.publishedAt ?? item.firstSeenAt) >= cutoff,
  );
  return sortItems(windowed);
}
