// Single data contract shared by the collector (output validator) and the site
// (input contract). Complete for all phases (DATA-01, DATA-07, D-02): later
// phases fill the intelligence fields, they never add a migration.
// Framework-free: no next/react imports.
import { z } from "zod";
import { CATEGORIES, SCHEMA_VERSION } from "./constants";

/** UTC ISO timestamp with a trailing 'Z' only (offsets rejected). */
const IsoUtc = z.iso.datetime();

export const Category = z.enum(CATEGORIES);
/** 'none' <=> publishedAt null. */
export const DatePrecision = z.enum(["datetime", "day", "none"]);
export const ItemKind = z.enum(["post", "paper", "release", "discussion", "newsletter"]);

/** Additive score points; all 0 in Phase 1 (D-02). */
export const ScoreBreakdown = z.object({
  source: z.number(),
  boosts: z.number(),
  coverage: z.number(),
  penalties: z.number(),
  ageDecay: z.number(),
});

/** Singleton cluster in Phase 1: id = item.id (INTL-02). */
export const ClusterInfo = z.object({
  id: z.string().min(1),
  isPrimary: z.boolean(),
  size: z.int().min(1),
  memberIds: z.array(z.string()),
});

// No per-run volatile fields here (Pitfall 5): an unchanged item must
// serialize to the same line on every run.
export const Item = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/), // sha256(canonicalUrl).slice(0, 16)
  url: z.httpUrl(), // canonical; rejects javascript:/data: (T-01-04)
  title: z.string().min(1).max(500),
  excerpt: z.string().max(280), // plain text; '' allowed
  lang: z.string().min(2).max(10),
  sourceId: z.string().min(1),
  company: z.string().min(1),
  kind: ItemKind,
  publishedAt: IsoUtc.nullable(), // never stamped "now" (DATA-03)
  datePrecision: DatePrecision,
  firstSeenAt: IsoUtc, // set once, never changes
  isBackfill: z.boolean(),
  categories: z.array(Category),
  primaryCategory: Category.nullable(),
  alsoSeenIn: z.array(z.string()),
  cluster: ClusterInfo,
  score: z.int().min(0).max(100),
  scoreBreakdown: ScoreBreakdown,
  isHighlight: z.boolean(),
});

export const ItemsFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  items: z.array(Item),
});

export const ErrorKind = z.enum([
  "timeout",
  "network",
  "http",
  "blocked",
  "parse",
  "empty",
  "parser_contract",
  "invalid",
]);

export const SourceHealth = z.object({
  id: z.string(),
  name: z.string(),
  url: z.httpUrl(),
  status: z.enum(["ok", "not_modified", "error", "disabled"]),
  optional: z.boolean(),
  lastAttemptAt: IsoUtc.nullable(),
  lastSuccessAt: IsoUtc.nullable(),
  consecutiveFailures: z.int().min(0),
  errorKind: ErrorKind.nullable(),
  httpStatus: z.int().nullable(),
  message: z.string().max(300).nullable(),
  itemsFetched: z.int().min(0),
  itemsNew: z.int().min(0),
});

const RunStatus = z.enum(["ok", "partial", "failed"]);

export const Meta = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  lastRunAt: IsoUtc,
  lastSuccessAt: IsoUtc.nullable(), // LIVE uses this, never lastRunAt
  lastRunStatus: RunStatus,
  run: z.object({
    startedAt: IsoUtc,
    finishedAt: IsoUtc,
    durationMs: z.int().min(0),
    trigger: z.enum(["schedule", "workflow_dispatch", "local", "unknown"]),
    sourcesOk: z.int().min(0),
    sourcesFailed: z.int().min(0),
    itemsTotal: z.int().min(0),
    itemsNew: z.int().min(0),
  }),
  sources: z.array(SourceHealth),
});

/** Compact client view written to public/data/meta.json (no sources array, T-01-06). */
export const PublicMeta = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  lastRunAt: IsoUtc.nullable(),
  lastSuccessAt: IsoUtc.nullable(),
  lastRunStatus: RunStatus.nullable(),
});

export type Category = z.infer<typeof Category>;
export type DatePrecision = z.infer<typeof DatePrecision>;
export type ItemKind = z.infer<typeof ItemKind>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;
export type ClusterInfo = z.infer<typeof ClusterInfo>;
export type Item = z.infer<typeof Item>;
export type ItemsFile = z.infer<typeof ItemsFile>;
export type ErrorKind = z.infer<typeof ErrorKind>;
export type SourceHealth = z.infer<typeof SourceHealth>;
export type Meta = z.infer<typeof Meta>;
export type PublicMeta = z.infer<typeof PublicMeta>;
