import { writeFileSync } from "node:fs";
import path from "node:path";
import { USERS } from "@/lib/data/entities/users";
import { studioApi } from "@/lib/harness/adapters/mastra/studio";
import { STUDIO_PORT } from "@/lib/harness/trace-link";
import { DATA_DIR } from "@/lib/server/store/json-store";

const API_PORT = Number(process.env.WINYU_STUDIO_API_PORT ?? 3214);
const PRESETS_FILE = path.join(DATA_DIR, "studio-presets.json");

function writePersonaPresets(): void {
  const presets = Object.fromEntries(USERS.map((user) => [`${user.id} · ${user.role}`, { userId: user.id }]));
  writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

writePersonaPresets();
const app = await studioApi(`http://localhost:${STUDIO_PORT}`);
Bun.serve({ port: API_PORT, fetch: app.fetch, idleTimeout: 0 });
const ui = Bun.spawn(["bunx", "mastra", "studio", "--port", String(STUDIO_PORT), "--server-port", String(API_PORT), "--request-context-presets", PRESETS_FILE], { stdout: "inherit", stderr: "inherit", env: { ...process.env, MASTRA_TELEMETRY_DISABLED: "1" } });
console.log(`Mastra API on http://localhost:${API_PORT}/api · Studio on http://localhost:${STUDIO_PORT} · pick a persona preset in the agent's request context`);
process.on("SIGINT", () => {
  ui.kill();
  process.exit(0);
});
await ui.exited;
