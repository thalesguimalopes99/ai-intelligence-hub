import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildViews } from "../scripts/build-views";
import { loadItemsFile, loadMeta } from "@/lib/data";

let tmp: string;
let dataDir: string;
let outDir: string;

const validMeta = {
  schemaVersion: 1,
  lastRunAt: "2026-10-06T17:17:00Z",
  lastSuccessAt: "2026-10-06T17:17:05Z",
  lastRunStatus: "ok",
  run: {
    startedAt: "2026-10-06T17:17:00Z",
    finishedAt: "2026-10-06T17:17:05Z",
    durationMs: 5000,
    trigger: "schedule",
    sourcesOk: 1,
    sourcesFailed: 0,
    itemsTotal: 0,
    itemsNew: 0,
  },
  sources: [
    {
      id: "openai-news",
      name: "OpenAI News",
      url: "https://openai.com/news/rss.xml",
      status: "ok",
      optional: false,
      lastAttemptAt: "2026-10-06T17:17:00Z",
      lastSuccessAt: "2026-10-06T17:17:05Z",
      consecutiveFailures: 0,
      errorKind: null,
      httpStatus: 200,
      message: null,
      itemsFetched: 10,
      itemsNew: 0,
    },
  ],
};

function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aih-build-views-"));
  dataDir = path.join(tmp, "data");
  outDir = path.join(tmp, "public", "data");
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("buildViews", () => {
  it("writes the compact PublicMeta picked from a valid data/meta.json (no sources)", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "meta.json"), JSON.stringify(validMeta));
    buildViews({ dataDir, outDir });
    const out = readJson(path.join(outDir, "meta.json"));
    expect(out).toEqual({
      schemaVersion: 1,
      lastRunAt: "2026-10-06T17:17:00Z",
      lastSuccessAt: "2026-10-06T17:17:05Z",
      lastRunStatus: "ok",
    });
    expect(out).not.toHaveProperty("sources");
  });

  it("writes an all-null PublicMeta when data/meta.json is missing (and creates outDir)", () => {
    expect(fs.existsSync(outDir)).toBe(false);
    buildViews({ dataDir, outDir });
    expect(readJson(path.join(outDir, "meta.json"))).toEqual({
      schemaVersion: 1,
      lastRunAt: null,
      lastSuccessAt: null,
      lastRunStatus: null,
    });
  });

  it("throws on an invalid data/meta.json and leaves no tmp file behind", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "meta.json"),
      JSON.stringify({ ...validMeta, lastSuccessAt: "2026-10-06T14:17:00-03:00" }),
    );
    expect(() => buildViews({ dataDir, outDir })).toThrow(/meta\.json/);
    expect(fs.existsSync(path.join(outDir, "meta.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "meta.json.tmp"))).toBe(false);
  });

  it("throws on malformed JSON in data/meta.json", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "meta.json"), "{ not json");
    expect(() => buildViews({ dataDir, outDir })).toThrow();
  });
});

describe("loaders", () => {
  it("loadItemsFile returns an empty ItemsFile when the dir is missing", () => {
    expect(loadItemsFile(path.join(tmp, "nope"))).toEqual({ schemaVersion: 1, items: [] });
  });

  it("loadItemsFile throws on an invalid items.json, naming the file", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "items.json"), JSON.stringify({ schemaVersion: 2, items: [] }));
    expect(() => loadItemsFile(dataDir)).toThrow(/items\.json/);
  });

  it("loadMeta returns null when missing and the parsed Meta when valid", () => {
    expect(loadMeta(dataDir)).toBeNull();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "meta.json"), JSON.stringify(validMeta));
    expect(loadMeta(dataDir)?.lastSuccessAt).toBe("2026-10-06T17:17:05Z");
  });
});
