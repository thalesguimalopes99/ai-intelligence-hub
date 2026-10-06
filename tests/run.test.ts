// Orchestrator tests with an injected fetcher (fixture text, never the network).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchError } from "../collector/http";
import { runCollector } from "../collector/run";
import { ItemsFile, Meta } from "@/shared/schema";

const xml = fs.readFileSync(path.resolve("tests/fixtures/feeds/openai.xml"), "utf8");
const okFetch = async () => ({ status: 200, text: xml });
const blockedFetch = async () => {
  throw new FetchError("blocked", 403, "<html>Just a m0ment...</html>");
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aih-run-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => () => new Date(iso);

function readItems() {
  return ItemsFile.parse(JSON.parse(fs.readFileSync(path.join(dir, "items.json"), "utf8")));
}
function readMeta() {
  return Meta.parse(JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")));
}

describe("runCollector", () => {
  it("first run writes windowed, backfill-marked items and ok meta", async () => {
    const r = await runCollector({
      dataDir: dir,
      now: at("2026-10-06T12:00:00Z"),
      env: {},
      fetchText: okFetch,
    });
    expect(r.runStatus).toBe("ok");
    const items = readItems().items;
    expect(r.itemsNew).toBe(items.length);
    // 14 real + 2 synthetic; 2 older than 30 days and the javascript: link drop out
    expect(items).toHaveLength(13);
    expect(items.every((i) => i.isBackfill)).toBe(true);
    const meta = readMeta();
    expect(meta.lastRunStatus).toBe("ok");
    expect(meta.run.trigger).toBe("local");
    expect(meta.sources[0]).toMatchObject({ status: "ok", itemsFetched: 15, itemsNew: 13 });
  });

  it("second identical run leaves items.json byte-identical and reports 0 new", async () => {
    await runCollector({ dataDir: dir, now: at("2026-10-06T12:00:00Z"), env: {}, fetchText: okFetch });
    const before = fs.readFileSync(path.join(dir, "items.json"));
    const r = await runCollector({
      dataDir: dir,
      now: at("2026-10-06T13:17:00Z"),
      env: { COLLECT_TRIGGER: "schedule" },
      fetchText: okFetch,
    });
    expect(r).toEqual({ itemsNew: 0, runStatus: "ok" });
    expect(fs.readFileSync(path.join(dir, "items.json")).equals(before)).toBe(true);
    expect(readMeta().lastRunAt).toBe("2026-10-06T13:17:00.000Z");
    expect(readMeta().run.trigger).toBe("schedule");
  });

  it("source failure keeps previous items, records health, run_status failed", async () => {
    await runCollector({ dataDir: dir, now: at("2026-10-06T12:00:00Z"), env: {}, fetchText: okFetch });
    const before = fs.readFileSync(path.join(dir, "items.json"));
    const r = await runCollector({
      dataDir: dir,
      now: at("2026-10-06T13:17:00Z"),
      env: {},
      fetchText: blockedFetch,
    });
    expect(r).toEqual({ itemsNew: 0, runStatus: "failed" });
    expect(fs.readFileSync(path.join(dir, "items.json")).equals(before)).toBe(true);
    const meta = readMeta();
    expect(meta.lastRunAt).toBe("2026-10-06T13:17:00.000Z");
    expect(meta.lastSuccessAt).toBe("2026-10-06T12:00:00.000Z");
    expect(meta.sources[0]).toMatchObject({
      status: "error",
      errorKind: "blocked",
      httpStatus: 403,
      consecutiveFailures: 1,
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[collect] openai-news failed: blocked http=403"),
    );
  });

  it("writes the GITHUB_OUTPUT contract", async () => {
    const out = path.join(dir, "gh-output.txt");
    const { writeGithubOutput } = await import("../collector/run");
    writeGithubOutput(out, { itemsNew: 3, runStatus: "partial" });
    expect(fs.readFileSync(out, "utf8")).toBe("items_new=3\nrun_status=partial\n");
    expect(() => writeGithubOutput(out, { itemsNew: -1, runStatus: "ok" })).toThrow();
    expect(() =>
      writeGithubOutput(out, { itemsNew: 1, runStatus: "ok\nevil=1" as "ok" }),
    ).toThrow();
  });
});
