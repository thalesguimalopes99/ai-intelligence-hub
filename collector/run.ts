// Collector entry point: read → fetch → normalize → merge → validate → write → GITHUB_OUTPUT.
// Contract with .github/workflows/collect.yml:
//   - $GITHUB_OUTPUT gets `items_new=<int>` and `run_status=<ok|partial|failed>`
//   - exit 0 = data written (even when run_status=failed: meta.json carries the
//     honest error health and the workflow fails the job after pushing it)
//   - exit 1 = validation/IO failure, nothing written
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SOURCES, type SourceConfig } from "../config/sources";
import { resolveDataDir } from "../src/lib/data";
import { SCHEMA_VERSION } from "../src/shared/constants";
import { Item as ItemSchema, type Item } from "../src/shared/schema";
import { parseRss } from "./adapters/rss";
import {
  classifyFetchError,
  fetchText as defaultFetchText,
  FetchError,
  sanitizeMessage,
} from "./http";
import { buildMeta, resolveTrigger, type SourceResult } from "./meta";
import { mergeItems } from "./pipeline/merge";
import { normalizeEntryResult } from "./pipeline/normalize";
import { readState, writeState } from "./store";

export type RunStatus = "ok" | "partial" | "failed";

export type RunOptions = {
  dataDir: string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  sources?: SourceConfig[];
  fetchText?: (url: string) => Promise<{ status: number; text: string }>;
};

export async function runCollector(
  opts: RunOptions,
): Promise<{ itemsNew: number; runStatus: RunStatus }> {
  const now = opts.now ?? (() => new Date());
  const env = opts.env ?? process.env;
  const sources = opts.sources ?? SOURCES;
  const fetchText = opts.fetchText ?? defaultFetchText;

  const startedAt = now().toISOString();
  const { itemsFile: prevFile, meta: prevMeta } = readState(opts.dataDir);
  const prevIds = new Set(prevFile.items.map((i) => i.id));
  const prevHealth = new Map((prevMeta?.sources ?? []).map((s) => [s.id, s]));

  let items: Item[] = prevFile.items;
  const results: SourceResult[] = [];

  for (const source of sources) {
    try {
      const { text } = await fetchText(source.url);
      const entries = parseRss(text);
      // Each entry is validated on its own (CR-01): a bad one is dropped and
      // logged, it never aborts the run for every other item and source.
      const fresh: Item[] = [];
      const dropReasons: string[] = [];
      for (const entry of entries) {
        const r = normalizeEntryResult(entry, source, startedAt);
        if (r.ok) {
          fresh.push(r.item);
        } else {
          dropReasons.push(r.reason);
          console.warn(
            `[collect] ${source.id} dropped entry: ${r.reason} link=${sanitizeMessage(entry.link, 200)}`,
          );
        }
      }
      if (fresh.length === 0) {
        const why = [...new Set(dropReasons)].join("; ");
        throw new FetchError(
          "parser_contract",
          null,
          `0 of ${entries.length} entries usable${why ? ` (${why})` : ""}`,
        );
      }
      const before = new Set(items.map((i) => i.id));
      items = mergeItems(items, fresh, startedAt, {
        sourceFirstRun: !prevHealth.get(source.id)?.lastSuccessAt,
      });
      const added = items.filter((i) => i.sourceId === source.id && !before.has(i.id)).length;
      results.push({ source, ok: true, itemsFetched: fresh.length, itemsNew: added });
    } catch (error) {
      const c = classifyFetchError(error);
      console.error(
        `[collect] ${source.id} failed: ${c.errorKind} http=${c.httpStatus ?? "-"} body=${c.message.slice(0, 200)}`,
      );
      // Previous items for this source are kept unchanged.
      results.push({ source, ok: false, ...c });
    }
  }

  // Window the stored set even when every source failed (still no churn if nothing aged out).
  items = mergeItems(items, [], startedAt, { sourceFirstRun: false });
  // Defense in depth (CR-01): drop and log anything the per-entry check missed
  // instead of letting ItemsFile.parse in writeState abort the whole run.
  items = items.filter((item) => {
    const check = ItemSchema.safeParse(item);
    if (!check.success) {
      console.warn(`[collect] dropped schema-invalid item ${String(item.id)} before write`);
    }
    return check.success;
  });
  const itemsNew = items.filter((i) => !prevIds.has(i.id)).length;

  const meta = buildMeta({
    prevMeta,
    results,
    startedAt,
    finishedAt: now().toISOString(),
    trigger: resolveTrigger(env.COLLECT_TRIGGER),
    itemsTotal: items.length,
    itemsNew,
  });
  writeState(opts.dataDir, { schemaVersion: SCHEMA_VERSION, items }, meta);
  return { itemsNew, runStatus: meta.lastRunStatus };
}

/** Append the workflow contract; only a validated integer and enum ever reach it (T-01-15). */
export function writeGithubOutput(
  file: string,
  r: { itemsNew: number; runStatus: RunStatus },
): void {
  if (!Number.isInteger(r.itemsNew) || r.itemsNew < 0) {
    throw new Error(`invalid items_new: ${r.itemsNew}`);
  }
  if (!["ok", "partial", "failed"].includes(r.runStatus)) {
    throw new Error("invalid run_status");
  }
  fs.appendFileSync(file, `items_new=${r.itemsNew}\nrun_status=${r.runStatus}\n`);
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir();
  try {
    const result = await runCollector({ dataDir });
    if (process.env.GITHUB_OUTPUT) writeGithubOutput(process.env.GITHUB_OUTPUT, result);
    console.log(
      `[collect] run_status=${result.runStatus} items_new=${result.itemsNew} data_dir=${dataDir}`,
    );
  } catch (error) {
    console.error("[collect] aborted, nothing written:", error);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main();
}
