import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, resetCollections } from "../lib/server/store/json-store";
import { ensureDemoStory } from "../lib/server/demo-story";
import { SWITCHES_COLLECTION } from "../lib/access/enforce";
import { ROLE_OVERRIDES_COLLECTION } from "../lib/access/role-overrides";

const STORY_ONLY = process.argv.includes("--story");
const KEPT_FILES = new Set([`${SWITCHES_COLLECTION}.json`, `${ROLE_OVERRIDES_COLLECTION}.json`]);

function clearDataDir() {
  if (!existsSync(DATA_DIR)) return 0;
  const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json") && !KEPT_FILES.has(file));
  for (const file of files) rmSync(path.join(DATA_DIR, file));
  return files.length;
}

if (!STORY_ONLY) {
  const removed = clearDataDir();
  mkdirSync(DATA_DIR, { recursive: true });
  resetCollections();
  console.log(`seed: reset ${DATA_DIR} (${removed} files removed)`);
}

const story = ensureDemoStory();
console.log(story ? `seed: demo story alert ${story.alertId} · packet ${story.packetId} (${story.created.packet ? "new" : "kept"}) · lesson ${story.created.outcome ? "new" : "kept"}` : "seed: demo story skipped (no alert on the story agent)");
