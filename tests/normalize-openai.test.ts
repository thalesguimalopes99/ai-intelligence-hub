// Offline tests against a trimmed real snapshot of https://openai.com/news/rss.xml
// (tests/fixtures/feeds/openai.xml). Never hits the network.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HTTPError, NetworkError, TimeoutError } from "ky";
import { describe, expect, it } from "vitest";
import { SOURCES } from "../config/sources";
import { parseRss } from "../collector/adapters/rss";
import { classifyFetchError, FetchError } from "../collector/http";
import { canonicalUrl, idFromUrl } from "../collector/pipeline/canonical-url";
import { normalizeEntry } from "../collector/pipeline/normalize";
import { Item } from "@/shared/schema";

const NOW = "2026-10-06T12:00:00.000Z";
const xml = fs.readFileSync(path.resolve("tests/fixtures/feeds/openai.xml"), "utf8");
const source = SOURCES[0];

describe("config/sources", () => {
  it("has exactly the OpenAI News source (D-01)", () => {
    expect(SOURCES).toHaveLength(1);
    expect(source).toMatchObject({
      id: "openai-news",
      url: "https://openai.com/news/rss.xml",
      company: "OpenAI",
      lang: "en",
      kind: "post",
      optional: false,
    });
  });
});

describe("parseRss", () => {
  it("parses the fixture into raw entries", () => {
    const entries = parseRss(xml);
    expect(entries.length).toBeGreaterThanOrEqual(12);
    expect(entries.length).toBeLessThanOrEqual(20);
    expect(entries[0]).toMatchObject({
      title: expect.any(String),
      link: expect.stringMatching(/^https:\/\/openai\.com\//),
    });
  });

  it("throws FetchError 'parse' on non-feed input", () => {
    expect(() => parseRss("<html><body>Just a moment...</body></html>")).toThrow(FetchError);
    try {
      parseRss("<html><body>Just a moment...</body></html>");
    } catch (e) {
      expect((e as FetchError).errorKind).toBe("parse");
    }
  });

  it("throws FetchError 'empty' on a feed with zero items", () => {
    const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><link>https://openai.com</link><description>d</description></channel></rss>`;
    try {
      parseRss(empty);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FetchError);
      expect((e as FetchError).errorKind).toBe("empty");
    }
  });
});

describe("canonicalUrl / idFromUrl", () => {
  it("canonicalizes www, utm, hash and trailing slash", () => {
    expect(canonicalUrl("https://www.openai.com/index/foo/?utm_source=x#h")).toBe(
      "https://openai.com/index/foo",
    );
  });

  it("returns null for non-http(s) and garbage", () => {
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("data:text/html,hi")).toBeNull();
    expect(canonicalUrl("not a url")).toBeNull();
    expect(canonicalUrl("")).toBeNull();
  });

  it("id is the first 16 hex chars of sha256(canonical)", () => {
    const c = "https://openai.com/index/foo";
    expect(idFromUrl(c)).toBe(createHash("sha256").update(c).digest("hex").slice(0, 16));
    expect(idFromUrl(c)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("normalizeEntry", () => {
  const entries = parseRss(xml);
  const items = entries.map((e) => normalizeEntry(e, source, NOW));
  const valid = items.filter((i): i is Item => i !== null);

  it("every non-null item passes Item.parse", () => {
    expect(valid.length).toBe(entries.length - 1); // only the javascript: link is dropped
    for (const it of valid) expect(() => Item.parse(it)).not.toThrow();
  });

  it("ids are stable and derived from the canonical url", () => {
    const again = entries.map((e) => normalizeEntry(e, source, NOW));
    expect(again.map((i) => i?.id)).toEqual(items.map((i) => i?.id));
    for (const it of valid) {
      expect(it.id).toBe(createHash("sha256").update(it.url).digest("hex").slice(0, 16));
    }
    expect(new Set(valid.map((i) => i.id)).size).toBe(valid.length);
  });

  it("sets source fields and neutral intelligence fields (D-02)", () => {
    const it0 = valid[0];
    expect(it0).toMatchObject({
      sourceId: "openai-news",
      company: "OpenAI",
      lang: "en",
      kind: "post",
      datePrecision: "datetime",
      categories: [],
      primaryCategory: null,
      score: 0,
      scoreBreakdown: { source: 0, boosts: 0, coverage: 0, penalties: 0, ageDecay: 0 },
      isHighlight: false,
      alsoSeenIn: [],
      isBackfill: false,
      firstSeenAt: NOW,
    });
    expect(it0.cluster).toEqual({ id: it0.id, isPrimary: true, size: 1, memberIds: [it0.id] });
    expect(it0.publishedAt).toBe("2026-10-05T15:00:00.000Z");
  });

  it("unparseable pubDate → publishedAt null, datePrecision 'none'", () => {
    const bad = valid.find((i) => i.url === "https://openai.com/index/synthetic-bad-date");
    expect(bad).toBeDefined();
    expect(bad!.publishedAt).toBeNull();
    expect(bad!.datePrecision).toBe("none");
  });

  it("drops a javascript: link instead of throwing", () => {
    const js = entries.find((e) => e.link.startsWith("javascript:"));
    expect(js).toBeDefined();
    expect(normalizeEntry(js!, source, NOW)).toBeNull();
  });

  it("drops entries with an empty title", () => {
    expect(
      normalizeEntry(
        { title: "   ", link: "https://openai.com/index/x", description: "", pubDate: "", guid: "" },
        source,
        NOW,
      ),
    ).toBeNull();
  });

  it("collapses whitespace and truncates excerpt to 280 chars with an ellipsis", () => {
    const long = "word  \n\t ".repeat(100) + "👩‍👩‍👧‍👦".repeat(100);
    const it = normalizeEntry(
      {
        title: "  A \n title  ",
        link: "https://openai.com/index/long",
        description: long,
        pubDate: "Mon, 05 Oct 2026 15:00:00 GMT",
        guid: "",
      },
      source,
      NOW,
    )!;
    expect(it.title).toBe("A title");
    expect(it.excerpt.length).toBeLessThanOrEqual(280);
    expect(it.excerpt.endsWith("…")).toBe(true);
    expect(it.excerpt).not.toMatch(/\s{2,}/);
    // grapheme-safe: no lone surrogate at the end
    expect(it.excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(it.excerpt.startsWith("word word")).toBe(true);
  });

  it("does not add an ellipsis when the excerpt fits", () => {
    const it = normalizeEntry(
      {
        title: "t",
        link: "https://openai.com/index/short",
        description: " short   text ",
        pubDate: "",
        guid: "",
      },
      source,
      NOW,
    )!;
    expect(it.excerpt).toBe("short text");
  });
});

describe("classifyFetchError", () => {
  const req = new Request("https://openai.com/news/rss.xml");
  // Minimal options object: HTTPError only reads it for messages.
  const opts = {} as ConstructorParameters<typeof HTTPError>[2];

  function httpError(status: number, body: string): HTTPError {
    const err = new HTTPError(new Response(body, { status }), req, opts);
    err.data = body;
    return err;
  }

  it("403 Cloudflare challenge → blocked", () => {
    const r = classifyFetchError(httpError(403, "<html><title>Just a moment...</title></html>"));
    expect(r.errorKind).toBe("blocked");
    expect(r.httpStatus).toBe(403);
    expect(r.message).toContain("Just a moment");
  });

  it("403 with cf-chl marker → blocked", () => {
    expect(classifyFetchError(httpError(403, "window._cf_chl_opt cf-chl-bypass")).errorKind).toBe(
      "blocked",
    );
  });

  it("other HTTP status → http", () => {
    const r = classifyFetchError(httpError(500, "oops"));
    expect(r).toMatchObject({ errorKind: "http", httpStatus: 500 });
  });

  it("TimeoutError → timeout", () => {
    expect(classifyFetchError(new TimeoutError(req))).toMatchObject({
      errorKind: "timeout",
      httpStatus: null,
    });
  });

  it("network error → network", () => {
    expect(classifyFetchError(new NetworkError(req)).errorKind).toBe("network");
    expect(classifyFetchError(new TypeError("fetch failed")).errorKind).toBe("network");
  });

  it("FetchError passes its own fields through", () => {
    const r = classifyFetchError(new FetchError("invalid", null, "too big"));
    expect(r).toEqual({ errorKind: "invalid", httpStatus: null, message: "too big" });
  });

  it("strips control chars and caps the message at 300 chars", () => {
    const r = classifyFetchError(httpError(500, "a\u0000b\u0007c" + "x".repeat(1000)));
    expect(r.message).not.toMatch(/[\u0000-\u001f]/);
    expect(r.message.length).toBeLessThanOrEqual(300);
    expect(r.message.startsWith("abc")).toBe(true);
  });
});
