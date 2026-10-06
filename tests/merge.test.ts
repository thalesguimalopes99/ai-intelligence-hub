import { describe, expect, it } from "vitest";
import { mergeItems } from "../collector/pipeline/merge";
import { sortItems } from "@/shared/serialize";
import { makeItem } from "./helpers/items";

const NOW = "2026-10-06T12:00:00.000Z";
const EARLIER = "2026-10-05T12:00:00.000Z";

describe("mergeItems", () => {
  const a = makeItem("a", "2026-10-05T15:00:00.000Z", EARLIER);
  const b = makeItem("b", "2026-10-04T15:00:00.000Z", EARLIER);

  it("unions by id and keeps the stored object (firstSeenAt, isBackfill) for known ids", () => {
    const prevA = { ...a, isBackfill: true };
    const freshA = { ...a, firstSeenAt: NOW, title: "Edited upstream" };
    const c = makeItem("c", "2026-10-06T10:00:00.000Z", NOW);
    const out = mergeItems([prevA, b], [freshA, c], NOW, { sourceFirstRun: false });
    expect(out.map((i) => i.id).sort()).toEqual([a.id, b.id, c.id].sort());
    const gotA = out.find((i) => i.id === a.id)!;
    expect(gotA.firstSeenAt).toBe(EARLIER);
    expect(gotA.isBackfill).toBe(true);
    expect(gotA.title).toBe(a.title);
  });

  it("is idempotent", () => {
    const c = makeItem("c", "2026-10-06T10:00:00.000Z", NOW);
    const once = mergeItems([a], [b, c], NOW, { sourceFirstRun: false });
    const twice = mergeItems(once, [b, c], NOW, { sourceFirstRun: false });
    expect(twice).toEqual(once);
  });

  it("drops items older than 30 days (publishedAt, else firstSeenAt)", () => {
    const old = makeItem("old", "2026-09-05T11:59:00.000Z", EARLIER);
    const edge = makeItem("edge", "2026-09-06T12:00:00.000Z", EARLIER);
    const undatedOld = makeItem("undated-old", null, "2026-09-01T00:00:00.000Z");
    const undatedNew = makeItem("undated-new", null, EARLIER);
    const out = mergeItems([old, undatedOld], [edge, undatedNew], NOW, { sourceFirstRun: false });
    const ids = out.map((i) => i.id);
    expect(ids).toContain(edge.id);
    expect(ids).toContain(undatedNew.id);
    expect(ids).not.toContain(old.id);
    expect(ids).not.toContain(undatedOld.id);
  });

  it("returns sortItems order", () => {
    const c = makeItem("c", "2026-10-06T10:00:00.000Z", NOW);
    const u = makeItem("u", null, NOW);
    const out = mergeItems([b, u], [a, c], NOW, { sourceFirstRun: false });
    expect(out).toEqual(sortItems(out));
    expect(out[0].id).toBe(c.id);
    expect(out[out.length - 1].id).toBe(u.id);
  });

  it("marks new items isBackfill only on the source's first successful run", () => {
    const first = mergeItems([], [a, b], NOW, { sourceFirstRun: true });
    expect(first.every((i) => i.isBackfill)).toBe(true);
    const c = makeItem("c", "2026-10-06T10:00:00.000Z", NOW);
    const later = mergeItems(first, [a, b, c], NOW, { sourceFirstRun: false });
    expect(later.find((i) => i.id === c.id)!.isBackfill).toBe(false);
    expect(later.find((i) => i.id === a.id)!.isBackfill).toBe(true);
  });

  it("upgrades a legacy item (no canonicalUrl) with the feed's original link once (CR-02)", () => {
    const legacy = { ...a, isBackfill: true }; // pre-CR-02: url is the canonical form
    const fresh = {
      ...a,
      url: "https://www.openai.com/index/a/",
      canonicalUrl: a.url,
      firstSeenAt: NOW,
      title: "Edited upstream",
    };
    const out = mergeItems([legacy], [fresh], NOW, { sourceFirstRun: false });
    expect(out[0]).toEqual({ ...legacy, url: fresh.url, canonicalUrl: a.url });
    // Upgraded items are stable: the next merge changes nothing.
    const again = mergeItems(out, [{ ...fresh, url: "https://openai.com/index/a?x" }], NOW, {
      sourceFirstRun: false,
    });
    expect(again).toEqual(out);
  });

  it("does not mutate its inputs", () => {
    const prev = [a];
    const fresh = [b];
    mergeItems(prev, fresh, NOW, { sourceFirstRun: true });
    expect(prev).toEqual([a]);
    expect(fresh[0].isBackfill).toBe(false);
  });
});
