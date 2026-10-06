// Build-time loaders for the canonical data/ directory (server/build only —
// never import from a client component: it would ship node:fs and the data).
// Missing files are normal before the first collector run (Pitfall 11) and
// yield the empty state; present-but-invalid files throw so `next build`
// fails and the last good deployment stays live (T-01-05).
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { DATA_DIR_DEFAULT, SCHEMA_VERSION } from "../shared/constants";
import { ItemsFile, Meta } from "../shared/schema";

export function resolveDataDir(): string {
  return path.resolve(process.cwd(), process.env.DATA_DIR ?? DATA_DIR_DEFAULT);
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseFile<T>(file: string, text: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${file}: ${message}`, { cause: error });
  }
}

export function loadItemsFile(dir: string = resolveDataDir()): ItemsFile {
  const file = path.join(dir, "items.json");
  const text = readIfExists(file);
  if (text === null) return { schemaVersion: SCHEMA_VERSION, items: [] };
  return parseFile(file, text, ItemsFile);
}

export function loadMeta(dir: string = resolveDataDir()): Meta | null {
  const file = path.join(dir, "meta.json");
  const text = readIfExists(file);
  if (text === null) return null;
  return parseFile(file, text, Meta);
}
