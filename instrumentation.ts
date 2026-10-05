export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileConnectors, startConnectorProbe } = await import("./lib/server/connectors/reconcile");
  void reconcileConnectors();
  const { recoverChatRuns } = await import("./lib/harness/adapters/mastra/recover");
  recoverChatRuns()
    .then((recovered) => recovered.forEach((entry) => console.info(`[mascop] chat run ${entry.runId} after restart: ${entry.outcome}`)))
    .catch((error: unknown) => console.error("[mascop] chat run recovery failed", error));
  const { schedulerEnabled } = await import("./lib/harness/adapters/mastra/jobs");
  if (!schedulerEnabled()) return;
  startConnectorProbe();
  const { mascopMastra } = await import("./lib/harness/adapters/mastra/agent");
  await mascopMastra().startWorkers();
}
