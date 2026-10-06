// meta.json builder (DATA-07): run + per-source health. lastSuccessAt only
// advances when at least one required source succeeded.
import type { SourceConfig } from "../config/sources";
import { SCHEMA_VERSION } from "../src/shared/constants";
import type { ErrorKind, Meta, SourceHealth } from "../src/shared/schema";

export type SourceResult =
  | { source: SourceConfig; ok: true; itemsFetched: number; itemsNew: number }
  | {
      source: SourceConfig;
      ok: false;
      errorKind: ErrorKind;
      httpStatus: number | null;
      message: string;
    };

export type Trigger = Meta["run"]["trigger"];

/** COLLECT_TRIGGER (github.event_name) → Meta trigger. */
export function resolveTrigger(value: string | undefined): Trigger {
  if (value === undefined || value === "") return "local";
  if (value === "schedule" || value === "workflow_dispatch") return value;
  return "unknown";
}

export type BuildMetaInput = {
  prevMeta: Meta | null;
  results: SourceResult[];
  startedAt: string;
  finishedAt: string;
  trigger: Trigger;
  itemsTotal: number;
  itemsNew: number;
};

function runStatus(results: SourceResult[]): Meta["lastRunStatus"] {
  const required = results.filter((r) => !r.source.optional);
  const pool = required.length > 0 ? required : results;
  if (pool.length === 0) return "failed";
  const okCount = pool.filter((r) => r.ok).length;
  if (okCount === pool.length) return "ok";
  if (okCount === 0) return "failed";
  return "partial";
}

function health(result: SourceResult, prev: SourceHealth | undefined, at: string): SourceHealth {
  const base = {
    id: result.source.id,
    name: result.source.name,
    url: result.source.url,
    optional: result.source.optional,
    lastAttemptAt: at,
  };
  if (result.ok) {
    return {
      ...base,
      status: "ok",
      lastSuccessAt: at,
      consecutiveFailures: 0,
      errorKind: null,
      httpStatus: null,
      message: null,
      itemsFetched: result.itemsFetched,
      itemsNew: result.itemsNew,
    };
  }
  return {
    ...base,
    status: "error",
    lastSuccessAt: prev?.lastSuccessAt ?? null,
    consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1,
    errorKind: result.errorKind,
    httpStatus: result.httpStatus,
    message: result.message.slice(0, 300),
    itemsFetched: 0,
    itemsNew: 0,
  };
}

export function buildMeta(input: BuildMetaInput): Meta {
  const { prevMeta, results, startedAt, finishedAt } = input;
  const status = runStatus(results);
  const prevSources = new Map((prevMeta?.sources ?? []).map((s) => [s.id, s]));
  const sourcesOk = results.filter((r) => r.ok).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    lastRunAt: finishedAt,
    lastSuccessAt: status === "failed" ? (prevMeta?.lastSuccessAt ?? null) : finishedAt,
    lastRunStatus: status,
    run: {
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      trigger: input.trigger,
      sourcesOk,
      sourcesFailed: results.length - sourcesOk,
      itemsTotal: input.itemsTotal,
      itemsNew: input.itemsNew,
    },
    sources: results.map((r) => health(r, prevSources.get(r.source.id), finishedAt)),
  };
}
