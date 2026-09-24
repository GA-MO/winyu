export const LMS_DEMO_ID = "lms_demo";
export const LMS_DEMO_PORT = 3199;
export const LMS_DEMO_TOOL = "training_history";

/** Where the demo LMS listens and the secret Cop signs identities with; both from env, with a local default for the demo only. */
export function lmsDemoEnv() {
  return {
    url: process.env.COP_LMS_DEMO_URL ?? `http://127.0.0.1:${LMS_DEMO_PORT}/mcp`,
    secret: process.env.COP_LMS_DEMO_SECRET ?? "cop-lms-demo-local-only",
  };
}
