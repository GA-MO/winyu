export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileConnectors } = await import("./lib/server/connectors/reconcile");
  void reconcileConnectors();
  if (process.env.COP_SCHEDULER === "off") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
