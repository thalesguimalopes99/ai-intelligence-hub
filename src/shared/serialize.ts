// Deterministic serialization (DATA-08): sorted, one item per line, so git
// diffs stay small and an unchanged dataset produces an identical file.
import type { Item, ItemsFile } from "./schema";

function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

/**
 * publishedAt desc; items without publishedAt go last ordered by firstSeenAt
 * desc; ties broken by id asc. Pure: returns a new array.
 * ISO UTC 'Z' strings sort lexicographically in chronological order.
 */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (a.publishedAt !== null && b.publishedAt !== null) {
      const byPublished = compareDesc(a.publishedAt, b.publishedAt);
      if (byPublished !== 0) return byPublished;
    } else if (a.publishedAt !== null) {
      return -1;
    } else if (b.publishedAt !== null) {
      return 1;
    } else {
      const bySeen = compareDesc(a.firstSeenAt, b.firstSeenAt);
      if (bySeen !== 0) return bySeen;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function serializeItemsFile(f: ItemsFile): string {
  if (f.items.length === 0) {
    return `{\n  "schemaVersion": ${f.schemaVersion},\n  "items": []\n}\n`;
  }
  const lines = f.items.map((it) => "    " + JSON.stringify(it));
  return `{\n  "schemaVersion": ${f.schemaVersion},\n  "items": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
