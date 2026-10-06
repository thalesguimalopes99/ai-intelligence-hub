import { describe, expect, it } from "vitest";
import { Item, ItemsFile } from "@/shared/schema";
import { serializeItemsFile, serializeJson, sortItems } from "@/shared/serialize";

function hexId(n: number): string {
  return n.toString(16).padStart(16, "0");
}

function makeItem(n: number, publishedAt: string | null, firstSeenAt: string): Item {
  const id = hexId(n);
  // Deliberately scrambled key order: Item.parse must restore schema order.
  return Item.parse({
    isHighlight: false,
    scoreBreakdown: { ageDecay: 0, penalties: 0, coverage: 0, boosts: 0, source: 0 },
    score: 0,
    cluster: { memberIds: [id], size: 1, isPrimary: true, id },
    alsoSeenIn: [],
    primaryCategory: null,
    categories: [],
    isBackfill: false,
    firstSeenAt,
    datePrecision: publishedAt ? "datetime" : "none",
    publishedAt,
    kind: "post",
    company: "OpenAI",
    sourceId: "openai-news",
    lang: "en",
    excerpt: "",
    title: `Item ${n}`,
    canonicalUrl: `https://openai.com/index/item-${n}`,
    url: `https://openai.com/index/item-${n}/`,
    id,
  });
}

describe("sortItems", () => {
  const a = makeItem(1, "2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z");
  const b = makeItem(2, "2026-10-05T10:00:00Z", "2026-10-05T10:05:00Z");
  const nullOld = makeItem(3, null, "2026-10-02T00:00:00Z");
  const nullNew = makeItem(4, null, "2026-10-04T00:00:00Z");
  const tieHigh = makeItem(6, "2026-10-03T10:00:00Z", "2026-10-03T10:05:00Z");
  const tieLow = makeItem(5, "2026-10-03T10:00:00Z", "2026-10-03T10:05:00Z");

  it("orders publishedAt desc, nulls last by firstSeenAt desc, ties by id asc", () => {
    const sorted = sortItems([nullOld, a, tieHigh, nullNew, b, tieLow]);
    expect(sorted.map((i) => i.id)).toEqual([
      b.id,
      tieLow.id,
      tieHigh.id,
      a.id,
      nullNew.id,
      nullOld.id,
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [a, b, nullOld];
    const copy = [...input];
    sortItems(input);
    expect(input).toEqual(copy);
  });
});

describe("serializeItemsFile", () => {
  const file: ItemsFile = {
    schemaVersion: 1,
    items: sortItems([
      makeItem(1, "2026-10-01T10:00:00Z", "2026-10-01T10:05:00Z"),
      makeItem(2, "2026-10-05T10:00:00Z", "2026-10-05T10:05:00Z"),
      makeItem(3, null, "2026-10-02T00:00:00Z"),
    ]),
  };

  it("emits exactly one item JSON per line and a trailing newline", () => {
    const text = serializeItemsFile(file);
    expect(text.endsWith("\n")).toBe(true);
    const itemLines = text.split("\n").filter((l) => l.startsWith('    {"id"'));
    expect(itemLines).toHaveLength(file.items.length);
    for (const line of itemLines) {
      expect(() => JSON.parse(line.trim().replace(/,$/, ""))).not.toThrow();
    }
  });

  it("round-trips through JSON.parse", () => {
    expect(JSON.parse(serializeItemsFile(file))).toEqual(file);
    expect(ItemsFile.parse(JSON.parse(serializeItemsFile(file)))).toEqual(file);
  });

  it("is deterministic", () => {
    expect(serializeItemsFile(file)).toBe(serializeItemsFile(file));
  });

  it("keeps schema key order after Item.parse", () => {
    const line = serializeItemsFile(file)
      .split("\n")
      .find((l) => l.startsWith('    {"id"'))!;
    const keys = Object.keys(JSON.parse(line.trim().replace(/,$/, "")));
    expect(keys).toEqual(Object.keys(Item.shape));
  });

  it("emits an empty items array for zero items", () => {
    const text = serializeItemsFile({ schemaVersion: 1, items: [] });
    expect(text).toBe('{\n  "schemaVersion": 1,\n  "items": []\n}\n');
    expect(JSON.parse(text)).toEqual({ schemaVersion: 1, items: [] });
  });
});

describe("serializeJson", () => {
  it("pretty prints with 2 spaces and a trailing newline", () => {
    expect(serializeJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
