// Runs explicitly before `next build` (package.json "build"; no implicit
// prebuild hook). Derives the compact client view public/data/meta.json
// (PublicMeta: timestamps + run status only, no sources) from the canonical
// data/meta.json. Missing data/ → all-null view (first deploy, Pitfall 11);
// invalid data/ → throw, so the build fails and the last good deploy stays.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadMeta, resolveDataDir } from "../src/lib/data";
import { PUBLIC_DATA_DIR, SCHEMA_VERSION } from "../src/shared/constants";
import { PublicMeta } from "../src/shared/schema";
import { serializeJson } from "../src/shared/serialize";

export interface BuildViewsOptions {
  dataDir: string;
  outDir: string;
}

function writeAtomic(file: string, contents: string): void {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, contents, "utf8");
    fs.renameSync(tmp, file);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

export function buildViews({ dataDir, outDir }: BuildViewsOptions): PublicMeta {
  const meta = loadMeta(dataDir); // throws on invalid data
  const view = PublicMeta.parse({
    schemaVersion: SCHEMA_VERSION,
    lastRunAt: meta?.lastRunAt ?? null,
    lastSuccessAt: meta?.lastSuccessAt ?? null,
    lastRunStatus: meta?.lastRunStatus ?? null,
  });
  fs.mkdirSync(outDir, { recursive: true });
  writeAtomic(path.join(outDir, "meta.json"), serializeJson(view));
  return view;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    const view = buildViews({
      dataDir: resolveDataDir(),
      outDir: path.resolve(process.cwd(), PUBLIC_DATA_DIR),
    });
    console.log(`build-views: wrote public/data/meta.json (lastSuccessAt=${view.lastSuccessAt})`);
  } catch (error) {
    console.error(`build-views: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
