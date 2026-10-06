// data/ persistence (DATA-08, PIPE-02, T-01-14): validate everything before
// touching disk, write via tmp + re-parse + rename, and rewrite items.json
// only when its stable serialization changed. meta.json is written every run.
import fs from "node:fs";
import path from "node:path";
import { loadItemsFile, loadMeta } from "../src/lib/data";
import { ItemsFile, Meta } from "../src/shared/schema";
import { serializeItemsFile, serializeJson } from "../src/shared/serialize";

export type State = { itemsFile: ItemsFile; meta: Meta | null };

/** Missing files → empty state; present-but-invalid files throw. */
export function readState(dataDir: string): State {
  return { itemsFile: loadItemsFile(dataDir), meta: loadMeta(dataDir) };
}

function readIfExists(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function atomicWrite(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, text, "utf8");
    JSON.parse(fs.readFileSync(tmp, "utf8")); // re-read: the bytes on disk must parse
    fs.renameSync(tmp, file);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

export function writeState(
  dataDir: string,
  itemsFile: ItemsFile,
  meta: Meta,
): { itemsChanged: boolean } {
  // Validate both before any write: an invalid run writes nothing.
  const validItems = ItemsFile.parse(itemsFile);
  const validMeta = Meta.parse(meta);
  const itemsText = serializeItemsFile(validItems);
  const metaText = serializeJson(validMeta);

  fs.mkdirSync(dataDir, { recursive: true });
  const itemsPath = path.join(dataDir, "items.json");
  const itemsChanged = readIfExists(itemsPath) !== itemsText;
  if (itemsChanged) atomicWrite(itemsPath, itemsText);
  atomicWrite(path.join(dataDir, "meta.json"), metaText);
  return { itemsChanged };
}
