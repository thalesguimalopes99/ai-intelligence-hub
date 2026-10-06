// CI/manual validation of the committed data/ directory (honours DATA_DIR, so
// data extracted from origin/main into a scratch dir can be checked too).
// Checks: zod schemas, unique item ids derived from the canonical URL, and that items.json is byte-identical
// to its stable serialization (DATA-08). Exit 1 on any failure.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { idFromUrl } from "../collector/pipeline/canonical-url";
import { loadItemsFile, loadMeta, resolveDataDir } from "../src/lib/data";
import { serializeItemsFile } from "../src/shared/serialize";

export function validateData(dataDir: string): string[] {
  const report: string[] = [];

  const itemsPath = path.join(dataDir, "items.json");
  if (fs.existsSync(itemsPath)) {
    const parsed = loadItemsFile(dataDir);
    const ids = new Set<string>();
    for (const item of parsed.items) {
      if (ids.has(item.id)) throw new Error(`${itemsPath}: duplicate item id ${item.id}`);
      ids.add(item.id);
      // id derives from the canonical URL; legacy (pre-CR-02) items have no
      // canonicalUrl and their url is the canonical form.
      if (idFromUrl(item.canonicalUrl ?? item.url) !== item.id) {
        throw new Error(`${itemsPath}: item ${item.id} id does not match its canonical URL`);
      }
    }
    const text = fs.readFileSync(itemsPath, "utf8");
    if (serializeItemsFile(parsed) !== text) {
      throw new Error(`${itemsPath}: not in stable serialization (one item per line, schema key order)`);
    }
    report.push(`items.json: ${parsed.items.length} items OK`);
  } else {
    report.push("items.json: absent");
  }

  const meta = loadMeta(dataDir);
  report.push(
    meta
      ? `meta.json: OK (lastRunStatus=${meta.lastRunStatus}, sources=${meta.sources.length})`
      : "meta.json: absent",
  );
  return report;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const dataDir = resolveDataDir();
  if (!fs.existsSync(dataDir)) {
    console.log("validate-data: no data/ yet, skipping");
    process.exit(0);
  }
  try {
    for (const line of validateData(dataDir)) console.log(`validate-data: ${line}`);
  } catch (error) {
    console.error(`validate-data: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
