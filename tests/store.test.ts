import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readState, writeState } from "../collector/store";
import { SCHEMA_VERSION } from "@/shared/constants";
import { Meta, type ItemsFile } from "@/shared/schema";
import { serializeItemsFile } from "@/shared/serialize";
import { makeItem } from "./helpers/items";

const T1 = "2026-10-06T12:00:00.000Z";
const T2 = "2026-10-06T13:17:00.000Z";

function meta(at: string): Meta {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastRunAt: at,
    lastSuccessAt: at,
    lastRunStatus: "ok",
    run: {
      startedAt: at,
      finishedAt: at,
      durationMs: 0,
      trigger: "local",
      sourcesOk: 1,
      sourcesFailed: 0,
      itemsTotal: 1,
      itemsNew: 1,
    },
    sources: [],
  };
}

const itemsFile: ItemsFile = {
  schemaVersion: SCHEMA_VERSION,
  items: [makeItem("a", "2026-10-05T15:00:00.000Z", T1)],
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aih-store-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("readState", () => {
  it("missing files → empty items file and null meta", () => {
    const s = readState(path.join(dir, "nope"));
    expect(s.itemsFile).toEqual({ schemaVersion: SCHEMA_VERSION, items: [] });
    expect(s.meta).toBeNull();
  });

  it("invalid files throw", () => {
    fs.writeFileSync(path.join(dir, "items.json"), '{"schemaVersion":1,"items":[{"id":"x"}]}');
    expect(() => readState(dir)).toThrow();
  });

  it("round-trips what writeState wrote", () => {
    writeState(dir, itemsFile, meta(T1));
    const s = readState(dir);
    expect(s.itemsFile).toEqual(itemsFile);
    expect(s.meta).toEqual(meta(T1));
  });
});

describe("writeState", () => {
  it("first write creates the directory and both files", () => {
    const sub = path.join(dir, "data");
    const r = writeState(sub, itemsFile, meta(T1));
    expect(r.itemsChanged).toBe(true);
    expect(fs.readFileSync(path.join(sub, "items.json"), "utf8")).toBe(serializeItemsFile(itemsFile));
    expect(JSON.parse(fs.readFileSync(path.join(sub, "meta.json"), "utf8"))).toEqual(meta(T1));
  });

  it("unchanged items: items.json bytes and mtime untouched, meta.json rewritten", () => {
    writeState(dir, itemsFile, meta(T1));
    const itemsPath = path.join(dir, "items.json");
    const old = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(itemsPath, old, old);
    const before = fs.readFileSync(itemsPath);
    const mtimeBefore = fs.statSync(itemsPath).mtimeMs;

    const r = writeState(dir, structuredClone(itemsFile), meta(T2));
    expect(r.itemsChanged).toBe(false);
    expect(fs.readFileSync(itemsPath).equals(before)).toBe(true);
    expect(fs.statSync(itemsPath).mtimeMs).toBe(mtimeBefore);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")).lastRunAt).toBe(T2);
  });

  it("invalid data throws and changes nothing, leaving no tmp files", () => {
    writeState(dir, itemsFile, meta(T1));
    const itemsBefore = fs.readFileSync(path.join(dir, "items.json"), "utf8");
    const metaBefore = fs.readFileSync(path.join(dir, "meta.json"), "utf8");

    const bad: ItemsFile = {
      schemaVersion: SCHEMA_VERSION,
      items: [{ ...makeItem("b", "2026-10-05T15:00:00.000Z", T2), score: 101 }],
    };
    expect(() => writeState(dir, bad, meta(T2))).toThrow();
    expect(fs.readFileSync(path.join(dir, "items.json"), "utf8")).toBe(itemsBefore);
    expect(fs.readFileSync(path.join(dir, "meta.json"), "utf8")).toBe(metaBefore);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("invalid meta also blocks the items write", () => {
    writeState(dir, itemsFile, meta(T1));
    const itemsBefore = fs.readFileSync(path.join(dir, "items.json"), "utf8");
    const changed: ItemsFile = {
      schemaVersion: SCHEMA_VERSION,
      items: [...itemsFile.items, makeItem("c", "2026-10-06T10:00:00.000Z", T2)],
    };
    const badMeta = { ...meta(T2), lastRunAt: "yesterday" } as Meta;
    expect(() => writeState(dir, changed, badMeta)).toThrow();
    expect(fs.readFileSync(path.join(dir, "items.json"), "utf8")).toBe(itemsBefore);
  });

  it("writes via a tmp file renamed in the same directory", () => {
    // Observe calls without changing behaviour (store.ts uses the default fs import).
    const observed = vi.spyOn(fs, "renameSync");
    writeState(dir, itemsFile, meta(T1));
    const calls = observed.mock.calls.map(([from, to]) => [String(from), String(to)]);
    observed.mockRestore();
    expect(calls).toHaveLength(2);
    for (const [from, to] of calls) {
      expect(path.dirname(from)).toBe(path.dirname(to));
      expect(from).toBe(`${to}.tmp`);
    }
  });
});
