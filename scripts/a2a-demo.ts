import { LOGISTICS_PARTNER_PORT, logisticsPartnerEnv } from "@/lib/server/connectors/logistics-partner-config";
import { startPartner } from "./a2a-demo-partner";

const server = startPartner({ port: LOGISTICS_PARTNER_PORT, token: logisticsPartnerEnv().token });
console.log(`Logistics partner A2A agent: card ${server.url}.well-known/agent-card.json, endpoint ${server.url}a2a`);
