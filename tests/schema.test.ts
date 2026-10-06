import { describe, expect, it } from "vitest";
import { Item, ItemsFile, Meta, PublicMeta, SourceHealth } from "@/shared/schema";
import { CATEGORIES, SCHEMA_VERSION } from "@/shared/constants";

const ID = "0123456789abcdef";

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    url: "https://openai.com/index/some-post/",
    title: "Introducing something",
    excerpt: "A short excerpt.",
    lang: "en",
    sourceId: "openai-news",
    company: "OpenAI",
    kind: "post",
    publishedAt: "2026-10-06T17:17:00Z",
    datePrecision: "datetime",
    firstSeenAt: "2026-10-06T17:20:00Z",
    isBackfill: false,
    categories: [],
    primaryCategory: null,
    alsoSeenIn: [],
    cluster: { id: ID, isPrimary: true, size: 1, memberIds: [ID] },
    score: 0,
    scoreBreakdown: { source: 0, boosts: 0, coverage: 0, penalties: 0, ageDecay: 0 },
    isHighlight: false,
    ...overrides,
  };
}

function makeSource(overrides: Record<string, unknown> = {}) {
  return {
    id: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    status: "error",
    optional: false,
    lastAttemptAt: "2026-10-06T17:17:00Z",
    lastSuccessAt: null,
    consecutiveFailures: 3,
    errorKind: "blocked",
    httpStatus: 403,
    message: "Forbidden",
    itemsFetched: 0,
    itemsNew: 0,
    ...overrides,
  };
}

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    lastRunAt: "2026-10-06T17:17:00Z",
    lastSuccessAt: null,
    lastRunStatus: "failed",
    run: {
      startedAt: "2026-10-06T17:17:00Z",
      finishedAt: "2026-10-06T17:17:05Z",
      durationMs: 5000,
      trigger: "schedule",
      sourcesOk: 0,
      sourcesFailed: 1,
      itemsTotal: 0,
      itemsNew: 0,
    },
    sources: [makeSource()],
    ...overrides,
  };
}

describe("constants", () => {
  it("exposes schema version 1 and the 13 INTL-03 categories", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(CATEGORIES).toHaveLength(13);
  });
});

describe("Item schema", () => {
  it("accepts a fully populated neutral item", () => {
    expect(Item.safeParse(makeItem()).success).toBe(true);
  });

  it("accepts a null publishedAt with datePrecision none", () => {
    expect(Item.safeParse(makeItem({ publishedAt: null, datePrecision: "none" })).success).toBe(
      true,
    );
  });

  it("rejects a javascript: URL", () => {
    expect(Item.safeParse(makeItem({ url: "javascript:alert(1)" })).success).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(Item.safeParse(makeItem({ url: "data:text/html,<b>x</b>" })).success).toBe(false);
  });

  it("rejects a timestamp with an offset (UTC Z only)", () => {
    expect(Item.safeParse(makeItem({ publishedAt: "2026-10-06T14:17:00-03:00" })).success).toBe(
      false,
    );
  });

  it("rejects score 101", () => {
    expect(Item.safeParse(makeItem({ score: 101 })).success).toBe(false);
  });

  it("rejects an item without cluster", () => {
    const { cluster: _cluster, ...rest } = makeItem();
    void _cluster;
    expect(Item.safeParse(rest).success).toBe(false);
  });

  it("rejects a non-hex id", () => {
    expect(Item.safeParse(makeItem({ id: "XYZ" })).success).toBe(false);
  });

  it("rejects an excerpt of 281 chars", () => {
    expect(Item.safeParse(makeItem({ excerpt: "a".repeat(281) })).success).toBe(false);
    expect(Item.safeParse(makeItem({ excerpt: "a".repeat(280) })).success).toBe(true);
  });

  it("rejects an unknown category", () => {
    expect(Item.safeParse(makeItem({ categories: ["crypto"] })).success).toBe(false);
  });
});

describe("ItemsFile schema", () => {
  it("accepts schemaVersion 1", () => {
    expect(ItemsFile.safeParse({ schemaVersion: 1, items: [makeItem()] }).success).toBe(true);
  });

  it("rejects schemaVersion 2", () => {
    expect(ItemsFile.safeParse({ schemaVersion: 2, items: [] }).success).toBe(false);
  });
});

describe("Meta / SourceHealth / PublicMeta schemas", () => {
  it("accepts Meta with lastSuccessAt null and lastRunStatus failed", () => {
    expect(Meta.safeParse(makeMeta()).success).toBe(true);
  });

  it("accepts SourceHealth with errorKind blocked", () => {
    expect(SourceHealth.safeParse(makeSource({ errorKind: "blocked" })).success).toBe(true);
  });

  it("rejects SourceHealth with negative consecutiveFailures", () => {
    expect(SourceHealth.safeParse(makeSource({ consecutiveFailures: -1 })).success).toBe(false);
  });

  it("accepts an all-null PublicMeta", () => {
    expect(
      PublicMeta.safeParse({
        schemaVersion: 1,
        lastRunAt: null,
        lastSuccessAt: null,
        lastRunStatus: null,
      }).success,
    ).toBe(true);
  });
});
