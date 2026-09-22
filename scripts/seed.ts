import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, resetCollections } from "../lib/server/store/json-store";

function clearDataDir() {
  if (!existsSync(DATA_DIR)) return 0;
  const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json"));
  for (const file of files) rmSync(path.join(DATA_DIR, file));
  return files.length;
}

const removed = clearDataDir();
mkdirSync(DATA_DIR, { recursive: true });
resetCollections();
console.log(`seed: reset ${DATA_DIR} (${removed} files removed)`);
