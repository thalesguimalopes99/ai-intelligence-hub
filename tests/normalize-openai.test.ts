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
import { normalizeEntry, normalizeEntryResult } from "../collector/pipeline/normalize";
import { formatItemDate } from "@/lib/format-date";
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
      expect(it.canonicalUrl).toBeDefined();
      expect(it.id).toBe(
        createHash("sha256").update(it.canonicalUrl!).digest("hex").slice(0, 16),
      );
    }
    expect(new Set(valid.map((i) => i.id)).size).toBe(valid.length);
  });

  it("keeps the original link for display and the canonical one only for the id (CR-02)", () => {
    const raw = (link: string) => ({ title: "t", link, description: "", pubDate: "", guid: "" });
    const gh = normalizeEntry(raw("  https://github.com/a/b/tree?ref=main  "), source, NOW)!;
    expect(gh.url).toBe("https://github.com/a/b/tree?ref=main");
    expect(gh.canonicalUrl).toBe("https://github.com/a/b/tree");
    expect(gh.id).toBe(idFromUrl("https://github.com/a/b/tree"));

    const www = normalizeEntry(raw("http://www.example.com/app/#/route?x=1"), source, NOW)!;
    expect(www.url).toBe("http://www.example.com/app/#/route?x=1");
    expect(www.canonicalUrl).toBe("https://example.com/app");

    // Same article via a tracking link → same id (dedupe still works).
    const tracked = normalizeEntry(raw("https://www.example.com/app?utm_source=x"), source, NOW)!;
    expect(tracked.id).toBe(www.id);
    expect(tracked.url).toBe("https://www.example.com/app?utm_source=x");
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

  it("drops entries the Item schema rejects instead of returning them (CR-01)", () => {
    const raw = (link: string, pubDate = "Mon, 05 Oct 2026 15:00:00 GMT") => ({
      title: "t",
      link,
      description: "",
      pubDate,
      guid: "",
    });
    // IDN host (punycode TLD) and IP host: z.httpUrl() rejects both.
    const idn = normalizeEntryResult(raw("https://пример.рф/a"), source, NOW);
    expect(idn.ok).toBe(false);
    expect(normalizeEntry(raw("https://пример.рф/a"), source, NOW)).toBeNull();
    const ip = normalizeEntryResult(raw("https://1.2.3.4/a"), source, NOW);
    expect(ip).toEqual({ ok: false, reason: expect.stringContaining("url") });
    // Year >= 10000 never produces an invalid '+010000-…' timestamp: it is a
    // far-future date, so it becomes "no date" (WR-01) and the item stays valid.
    const y10k = normalizeEntry(
      raw("https://openai.com/index/y10k", "Sat, 01 Jan 10000 00:00:00 GMT"),
      source,
      NOW,
    )!;
    expect(y10k).not.toBeNull();
    expect(() => Item.parse(y10k)).not.toThrow();
    expect(y10k.publishedAt).toBeNull();
  });

  it("stores a date-only pubDate as noon UTC with datePrecision 'day' (WR-02)", () => {
    const raw = (pubDate: string) => ({
      title: "t",
      link: "https://openai.com/index/day",
      description: "",
      pubDate,
      guid: "",
    });
    for (const input of ["2026-10-05", "Mon, 05 Oct 2026", "05 Oct 2026", " 5 Oct 26 "]) {
      const it = normalizeEntry(raw(input), source, NOW)!;
      expect(it, input).toMatchObject({
        publishedAt: "2026-10-05T12:00:00.000Z",
        datePrecision: "day",
      });
      expect(formatItemDate(it)).toBe("05/10/2026");
    }
    // Impossible day → no date, never a rolled-over one.
    expect(normalizeEntry(raw("2026-02-31"), source, NOW)).toMatchObject({
      publishedAt: null,
      datePrecision: "none",
    });
    // A time component keeps full precision.
    expect(normalizeEntry(raw("2026-10-05T15:00:00Z"), source, NOW)!.datePrecision).toBe(
      "datetime",
    );
  });

  it("treats a publish date more than 24h in the future as unknown (WR-01)", () => {
    const raw = (pubDate: string) => ({
      title: "t",
      link: "https://openai.com/index/future",
      description: "",
      pubDate,
      guid: "",
    });
    const typo = normalizeEntry(raw("Tue, 06 Oct 2099 10:00:00 GMT"), source, NOW)!;
    expect(typo).toMatchObject({ publishedAt: null, datePrecision: "none", firstSeenAt: NOW });
    // Within the tolerance (time-zone skew, early publish) the date is kept.
    const soon = normalizeEntry(raw("Tue, 06 Oct 2026 20:00:00 GMT"), source, NOW)!;
    expect(soon.publishedAt).toBe("2026-10-06T20:00:00.000Z");
  });

  it("resolves relative links and falls back to a permalink guid (WR-04)", () => {
    const raw = (link: string, guid = "") => ({ title: "t", link, description: "", pubDate: "", guid });
    // source.url = https://openai.com/news/rss.xml
    expect(normalizeEntry(raw("/index/rel"), source, NOW)!.url).toBe("https://openai.com/index/rel");
    expect(normalizeEntry(raw("./x"), source, NOW)!.url).toBe("https://openai.com/news/x");
    expect(normalizeEntry(raw("", "https://openai.com/index/g"), source, NOW)!.url).toBe(
      "https://openai.com/index/g",
    );
    // Non-URL guid, bare words, javascript: and an empty link stay unusable.
    expect(normalizeEntry(raw("", "tag:openai.com,2026:1"), source, NOW)).toBeNull();
    expect(normalizeEntry(raw("not a url"), source, NOW)).toBeNull();
    expect(normalizeEntry(raw("javascript:alert(1)", "https://openai.com/x"), source, NOW)).toBeNull();
    expect(normalizeEntry(raw(""), source, NOW)).toBeNull();
  });

  it("parseRss: only permalink guids are kept; Atom text constructs and relative links work (WR-04)", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><link>https://openai.com</link><description>d</description>
      <item><title>A</title><guid isPermaLink="false">https://openai.com/index/not-permalink</guid></item>
      <item><title>B</title><guid>https://openai.com/index/permalink</guid></item></channel></rss>`;
    const [a, b] = parseRss(rss);
    expect(a.guid).toBe("");
    expect(b.guid).toBe("https://openai.com/index/permalink");
    expect(normalizeEntry(b, source, NOW)!.url).toBe("https://openai.com/index/permalink");

    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><id>x</id><updated>2026-10-05T00:00:00Z</updated>
      <entry><title>Atom entry</title><id>tag:a</id><link href="/news/rel"/><summary>&lt;p&gt;Hi&lt;/p&gt;</summary><updated>2026-10-05T10:00:00Z</updated></entry></feed>`;
    const [e] = parseRss(atom);
    const item = normalizeEntry(e, source, NOW)!;
    expect(item).toMatchObject({
      title: "Atom entry",
      url: "https://openai.com/news/rel",
      excerpt: "Hi",
      publishedAt: "2026-10-05T10:00:00.000Z",
    });
  });

  it("turns an HTML description into a plain-text excerpt (WR-03)", () => {
    const html =
      '<p>Hello&nbsp;<a href="https://x.y">world</a> &amp; friends &#8212; caf&#xE9;</p>' +
      "<script>alert(1)</script><style>p{}</style><!-- note --><br/>Next&hellip; &bogus; &#0;";
    const it = normalizeEntry(
      { title: "t", link: "https://openai.com/index/html", description: html, pubDate: "", guid: "" },
      source,
      NOW,
    )!;
    expect(it.excerpt).toBe("Hello world & friends — café Next… &bogus; &#0;");
    expect(it.excerpt).not.toMatch(/<[a-z/]/i);
    // The 280 cut happens on text, never inside a tag.
    const long = normalizeEntry(
      {
        title: "t",
        link: "https://openai.com/index/html-long",
        description: `<p>${"word ".repeat(80)}</p><a href="https://example.com/very/long">link</a>`,
        pubDate: "",
        guid: "",
      },
      source,
      NOW,
    )!;
    expect(long.excerpt.length).toBeLessThanOrEqual(280);
    expect(long.excerpt).not.toContain("<");
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
