import { startChannelSimulator } from "./channels-sim";
import { handleLineWebhook } from "@/lib/server/channels/line";
import { handleTeamsWebhook } from "@/lib/server/channels/teams";

/** The values a test or a local walk runs both channels with; every secret here is a fixture, never a real credential. */
export const SIMULATED = {
  teams: { appId: "00000000-aaaa-4bbb-8ccc-000000000001", tenantId: "11111111-2222-4333-8444-555555555555" },
  line: { channelId: "2000000001", channelSecret: "simulated-line-channel-secret", accessToken: "simulated-line-access-token", botUserId: "Ubot0000000000000000000000000001" },
  web: "https://winyu.example.com",
} as const;

/** The environment that points Winyu's channels at a simulator. */
export function simulatedEnv(simulatorOrigin: string): Record<string, string> {
  return {
    TEAMS_APP_ID: SIMULATED.teams.appId,
    TEAMS_APP_TENANT_ID: SIMULATED.teams.tenantId,
    TEAMS_SIMULATOR_URL: simulatorOrigin,
    LINE_CHANNEL_ID: SIMULATED.line.channelId,
    LINE_CHANNEL_SECRET: SIMULATED.line.channelSecret,
    LINE_CHANNEL_ACCESS_TOKEN: SIMULATED.line.accessToken,
    LINE_API_URL: simulatorOrigin,
    LINE_ACCESS_URL: simulatorOrigin,
  };
}

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
