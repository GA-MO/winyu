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
