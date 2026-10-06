import { describe, expect, it } from "vitest";
import { SOURCES, type SourceConfig } from "../config/sources";
import { buildMeta, resolveTrigger, type SourceResult } from "../collector/meta";
import { Meta } from "@/shared/schema";

const START = "2026-10-06T12:00:00.000Z";
const END = "2026-10-06T12:00:03.500Z";
const PREV_SUCCESS = "2026-10-06T11:17:40.000Z";
const source = SOURCES[0];
const optionalSource: SourceConfig = {
  ...source,
  id: "opt",
  name: "Optional",
  url: "https://example.com/feed.xml",
  optional: true,
};

function prevMeta(consecutiveFailures = 0): Meta {
  return Meta.parse({
    schemaVersion: 1,
    lastRunAt: PREV_SUCCESS,
    lastSuccessAt: PREV_SUCCESS,
    lastRunStatus: "ok",
    run: {
      startedAt: "2026-10-06T11:17:37.000Z",
      finishedAt: PREV_SUCCESS,
      durationMs: 3000,
      trigger: "schedule",
      sourcesOk: 1,
      sourcesFailed: 0,
      itemsTotal: 10,
      itemsNew: 10,
    },
    sources: [
      {
        id: source.id,
        name: source.name,
        url: source.url,
        status: "ok",
        optional: false,
        lastAttemptAt: PREV_SUCCESS,
        lastSuccessAt: PREV_SUCCESS,
        consecutiveFailures,
        errorKind: null,
        httpStatus: null,
        message: null,
        itemsFetched: 10,
        itemsNew: 10,
      },
    ],
  });
}

const failure: SourceResult = {
  source,
  ok: false,
  errorKind: "blocked",
  httpStatus: 403,
  message: "Just a m0ment...",
};

describe("buildMeta", () => {
  it("ok run: advances lastSuccessAt and resets source health", () => {
    const meta = buildMeta({
      prevMeta: prevMeta(2),
      results: [{ source, ok: true, itemsFetched: 14, itemsNew: 2 }],
      startedAt: START,
      finishedAt: END,
      trigger: "schedule",
      itemsTotal: 12,
      itemsNew: 2,
    });
    expect(() => Meta.parse(meta)).not.toThrow();
    expect(meta.lastRunAt).toBe(END);
    expect(meta.lastSuccessAt).toBe(END);
    expect(meta.lastRunStatus).toBe("ok");
    expect(meta.run).toEqual({
      startedAt: START,
      finishedAt: END,
      durationMs: 3500,
      trigger: "schedule",
      sourcesOk: 1,
      sourcesFailed: 0,
      itemsTotal: 12,
      itemsNew: 2,
    });
    expect(meta.sources[0]).toMatchObject({
      id: "openai-news",
      status: "ok",
      consecutiveFailures: 0,
      errorKind: null,
      httpStatus: null,
      message: null,
      lastAttemptAt: END,
      lastSuccessAt: END,
      itemsFetched: 14,
      itemsNew: 2,
    });
  });

  it("failed run: lastRunAt advances, lastSuccessAt kept, failure recorded", () => {
    const meta = buildMeta({
      prevMeta: prevMeta(1),
      results: [failure],
      startedAt: START,
      finishedAt: END,
      trigger: "workflow_dispatch",
      itemsTotal: 10,
      itemsNew: 0,
    });
    expect(() => Meta.parse(meta)).not.toThrow();
    expect(meta.lastRunAt).toBe(END);
    expect(meta.lastSuccessAt).toBe(PREV_SUCCESS);
    expect(meta.lastRunStatus).toBe("failed");
    expect(meta.run.sourcesFailed).toBe(1);
    expect(meta.sources[0]).toMatchObject({
      status: "error",
      consecutiveFailures: 2,
      errorKind: "blocked",
      httpStatus: 403,
      message: "Just a m0ment...",
      lastAttemptAt: END,
      lastSuccessAt: PREV_SUCCESS,
      itemsFetched: 0,
      itemsNew: 0,
    });
  });

  it("failed first-ever run: lastSuccessAt stays null", () => {
    const meta = buildMeta({
      prevMeta: null,
      results: [failure],
      startedAt: START,
      finishedAt: END,
      trigger: "local",
      itemsTotal: 0,
      itemsNew: 0,
    });
    expect(() => Meta.parse(meta)).not.toThrow();
    expect(meta.lastSuccessAt).toBeNull();
    expect(meta.sources[0].lastSuccessAt).toBeNull();
    expect(meta.sources[0].consecutiveFailures).toBe(1);
  });

  it("optional failure with required success → ok (plan rule), source marked error", () => {
    const meta = buildMeta({
      prevMeta: null,
      results: [
        { source, ok: true, itemsFetched: 3, itemsNew: 3 },
        { ...failure, source: optionalSource },
      ],
      startedAt: START,
      finishedAt: END,
      trigger: "local",
      itemsTotal: 3,
      itemsNew: 3,
    });
    expect(meta.lastRunStatus).toBe("ok");
    expect(meta.lastSuccessAt).toBe(END);
    expect(meta.sources[1].status).toBe("error");
    expect(meta.run.sourcesFailed).toBe(1);
  });

  it("one of two required sources failing → partial, lastSuccessAt advances", () => {
    const other: SourceConfig = { ...optionalSource, id: "req2", optional: false };
    const meta = buildMeta({
      prevMeta: null,
      results: [
        { source, ok: true, itemsFetched: 3, itemsNew: 3 },
        { ...failure, source: other },
      ],
      startedAt: START,
      finishedAt: END,
      trigger: "local",
      itemsTotal: 3,
      itemsNew: 3,
    });
    expect(meta.lastRunStatus).toBe("partial");
    expect(meta.lastSuccessAt).toBe(END);
  });
});

describe("resolveTrigger", () => {
  it("maps COLLECT_TRIGGER", () => {
    expect(resolveTrigger("schedule")).toBe("schedule");
    expect(resolveTrigger("workflow_dispatch")).toBe("workflow_dispatch");
    expect(resolveTrigger(undefined)).toBe("local");
    expect(resolveTrigger("")).toBe("local");
    expect(resolveTrigger("push")).toBe("unknown");
  });
});
