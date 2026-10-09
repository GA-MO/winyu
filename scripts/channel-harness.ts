import { startChannelSimulator } from "./channels-sim";
import { handleLineWebhook } from "@/lib/server/channels/line";
import { handleTeamsWebhook } from "@/lib/server/channels/teams";
import { SIMULATED, simulatedEnv } from "./channel-sim-env";

export { SIMULATED, simulatedEnv };

/** For tests: serves Winyu's two webhooks in-process (holding each response until the work it started has finished, so a test reads the replies right after) and a simulator posting to them. */
export function startChannelHarness() {
  const pending: Promise<unknown>[] = [];
  const waitUntil = (task: Promise<unknown>) => void pending.push(task);
  const settled = async (response: Response) => {
    while (pending.length > 0) await Promise.allSettled(pending.splice(0));
    return response;
  };
  const winyu = Bun.serve({
    port: 0,
    idleTimeout: 0,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/channels/teams") return settled(await handleTeamsWebhook(request, waitUntil));
      if (path === "/api/channels/line") return settled(await handleLineWebhook(request, waitUntil));
      return new Response("not found", { status: 404 });
    },
  });
  const winyuOrigin = `http://localhost:${winyu.port}`;
  const simulator = startChannelSimulator({ port: 0, winyu: winyuOrigin, replyWaitMs: 0, teams: SIMULATED.teams, line: SIMULATED.line });
  Object.assign(process.env, simulatedEnv(simulator.origin), { WINYU_PUBLIC_URL: SIMULATED.web });
  return {
    simulator,
    winyuOrigin,
    stop: () => {
      simulator.stop();
      winyu.stop(true);
    },
  };
}
