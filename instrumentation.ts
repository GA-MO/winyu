export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileConnectors } = await import("./lib/server/connectors/reconcile");
  void reconcileConnectors();
  if (process.env.WINYU_SCHEDULER === "off") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
