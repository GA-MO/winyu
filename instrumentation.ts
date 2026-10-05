export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileConnectors } = await import("./lib/server/connectors/reconcile");
  void reconcileConnectors();
  const { recoverChatRuns } = await import("./lib/harness/adapters/mastra/recover");
  recoverChatRuns()
    .then((recovered) => recovered.forEach((entry) => console.info(`[mascop] chat run ${entry.runId} after restart: ${entry.outcome}`)))
    .catch((error: unknown) => console.error("[mascop] chat run recovery failed", error));
  if (process.env.MASCOP_SCHEDULER === "off") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
