import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../lib/server/store/json-store";

const SNAPSHOT_DIR = path.join(process.cwd(), "deploy", "seed-data");
const MASTRA_DB = "mastra.db";
const DROPPED_FILES = new Set(["secrets.json"]);
const EMPTIED_FILES = ["connectors.json", "connector-secrets.json", "connector-upstream.json", "mcp-tokens.json"];

type Row = { id?: unknown };

function readRows(file: string): Row[] {
  return JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, file), "utf8")) as Row[];
}

function writeRows(file: string, rows: Row[]) {
  writeFileSync(path.join(SNAPSHOT_DIR, file), `${JSON.stringify(rows, null, 2)}\n`);
}

function copyCollections(): number {
  const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json") && !DROPPED_FILES.has(file));
  for (const file of files) copyFileSync(path.join(DATA_DIR, file), path.join(SNAPSHOT_DIR, file));
  return files.length;
}

function backupMastraDb() {
  const target = path.join(SNAPSHOT_DIR, MASTRA_DB);
  const result = Bun.spawnSync(["sqlite3", path.join(DATA_DIR, MASTRA_DB), `.backup '${target}'`]);
  if (result.exitCode !== 0) throw new Error(`sqlite3 backup failed: ${result.stderr.toString()}`);
  const check = Bun.spawnSync(["sqlite3", target, "pragma integrity_check"]).stdout.toString().trim();
  if (check !== "ok") throw new Error(`snapshot ${MASTRA_DB} integrity_check: ${check}`);
  Bun.spawnSync(["sqlite3", target, "pragma wal_checkpoint(TRUNCATE)"]);
  for (const suffix of ["-wal", "-shm"]) rmSync(`${target}${suffix}`, { force: true });
}

function dropConsoleConnectors(): string[] {
  const connectorIds = readRows("connectors.json").map((row) => String(row.id));
  for (const file of EMPTIED_FILES) if (existsSync(path.join(SNAPSHOT_DIR, file))) writeRows(file, []);
  const switchIds = new Set(connectorIds.map((id) => `connector:${id}`));
  writeRows("switches.json", readRows("switches.json").filter((row) => !switchIds.has(String(row.id))));
  writeRows("connector-health.json", readRows("connector-health.json").filter((row) => !connectorIds.includes(String(row.id))));
  return connectorIds;
}

rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
mkdirSync(SNAPSHOT_DIR, { recursive: true });
const copied = copyCollections();
backupMastraDb();
const dropped = dropConsoleConnectors();
console.log(`deploy-snapshot: ${copied} collections and ${MASTRA_DB} from ${DATA_DIR} into ${SNAPSHOT_DIR}`);
console.log(`deploy-snapshot: removed console connectors [${dropped.join(", ")}], MCP tokens, and ${[...DROPPED_FILES].join(", ")}`);
