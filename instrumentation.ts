export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.COP_SCHEDULER === "off") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
