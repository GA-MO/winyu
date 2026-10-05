import { randomUUID } from "node:crypto";

/** One inbound truck as the partner tracks it; a different company's records, so its own names and labels. */
export type Shipment = { shipment: string; dc: string; origin: string; load: string; eta_label: string; status: string; note: string };

const AGENT_PATH = "/a2a";
const CARD_PATH = "/.well-known/agent-card.json";
const NAME = "Siam Freight logistics agent (demo)";
const ERROR = { parse: -32700, methodNotFound: -32601, invalidParams: -32602, unauthorized: -32001 } as const;

/** The partner's fictional open shipments to Boon Rawd's distribution centres. */
export const DEMO_SHIPMENTS: readonly Shipment[] = [
  { shipment: "SF-4471", dc: "DC Lamphun", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "เพอร์ร่า PET 600 · 1,800 ลัง", eta_label: "23 ก.ย. 14:00", status: "ตรงเวลา", note: "ออกจากต้นทาง 05:40" },
  { shipment: "SF-4479", dc: "DC Lamphun", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "สิงห์ 320 มล. · 2,400 ลัง", eta_label: "24 ก.ย. 09:30", status: "ล่าช้า 3 ชม.", note: "ฝนตกหนักช่วงลำปาง" },
  { shipment: "SF-4502", dc: "DC Chiang Mai", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "ลีโอ 620 มล. · 3,000 ลัง", eta_label: "23 ก.ย. 18:15", status: "ตรงเวลา", note: "" },
  { shipment: "SF-4388", dc: "DC Khon Kaen", origin: "โรงเบียร์ขอนแก่น", load: "สิงห์โซดา · 2,200 ลัง", eta_label: "23 ก.ย. 11:00", status: "ถึงแล้ว", note: "ลงสินค้าเสร็จ 11:40" },
  { shipment: "SF-4391", dc: "DC Khon Kaen", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "ลีโอ 490 มล. · 2,800 ลัง", eta_label: "24 ก.ย. 07:00", status: "ตรงเวลา", note: "" },
  { shipment: "SF-4415", dc: "DC Korat", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "น้ำดื่มสิงห์ · 4,000 แพ็ก", eta_label: "23 ก.ย. 16:30", status: "ตรงเวลา", note: "" },
  { shipment: "SF-4433", dc: "DC Bangkok", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "สิงห์ 620 มล. · 5,200 ลัง", eta_label: "23 ก.ย. 10:00", status: "ถึงแล้ว", note: "" },
  { shipment: "SF-4450", dc: "DC Songkhla", origin: "โรงเบียร์บุญรอด ปทุมธานี", load: "ลีโอ 620 มล. · 2,600 ลัง", eta_label: "25 ก.ย. 08:00", status: "ล่าช้า 1 วัน", note: "รอเรือข้ามฟากช่วงชุมพร" },
];

type PartnerOptions = { port: number; token: string; shipments?: readonly Shipment[]; hostname?: string };

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function textOf(params: unknown): string {
  const parts = (params as { message?: { parts?: { kind?: string; text?: string }[] } } | null)?.message?.parts ?? [];
  return parts.flatMap((part) => (part.kind === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ");
}

function shipmentsAsked(text: string, shipments: readonly Shipment[]): Shipment[] {
  const lowered = text.toLowerCase();
  return shipments.filter((shipment) => lowered.includes(shipment.dc.toLowerCase()));
}

function replyFor(found: readonly Shipment[]): string {
  if (found.length === 0) return "ไม่พบรถของ Siam Freight ที่กำลังไปศูนย์กระจายสินค้านี้ ระบุชื่อ DC เป็นภาษาอังกฤษ เช่น DC Lamphun";
  const lines = found.map((shipment) => `${shipment.shipment} (${shipment.load}) ถึง ${shipment.eta_label} ${shipment.status}${shipment.note ? ` · ${shipment.note}` : ""}`);
  return `รถ ${found.length} คันกำลังไป ${found[0]?.dc}: ${lines.join("; ")}`;
}

function card(origin: string) {
  return {
    protocolVersion: "0.3.0",
    name: NAME,
    description: "Answers delivery ETAs for trucks Siam Freight runs to Boon Rawd distribution centres. Ask with the DC name, e.g. 'ETA to DC Lamphun'.",
    url: `${origin}${AGENT_PATH}`,
    preferredTransport: "JSONRPC",
    version: "0.1.0",
    provider: { organization: "Siam Freight (fictional demo)", url: origin },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    security: [{ bearer: [] }],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [{ id: "delivery-eta", name: "Delivery ETA", description: "Open shipments and their ETA for one distribution centre.", tags: ["logistics"], examples: ["ETA to DC Lamphun"] }],
  };
}

/** A model-free A2A agent another company runs: a public card, and `message/send` with a bearer token answering which trucks are heading to the DC named in the question, as text plus a data part. */
export function partnerFetch(options: PartnerOptions) {
  const shipments = options.shipments ?? DEMO_SHIPMENTS;
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === CARD_PATH) return Response.json(card(url.origin));
    if (request.method !== "POST" || url.pathname !== AGENT_PATH) return new Response("Not found", { status: 404 });
    if (request.headers.get("authorization") !== `Bearer ${options.token}`) return rpcError(null, ERROR.unauthorized, "Unauthorized", 401);
    let body: { id?: unknown; method?: unknown; params?: unknown };
    try {
      body = await request.json();
    } catch {
      return rpcError(null, ERROR.parse, "Parse error");
    }
    if (body.method !== "message/send") return rpcError(body.id, ERROR.methodNotFound, `Method ${String(body.method)} is not served`);
    const text = textOf(body.params);
    if (!text) return rpcError(body.id, ERROR.invalidParams, "A text part is required");
    const found = shipmentsAsked(text, shipments);
    const contextId = (body.params as { message?: { contextId?: string } }).message?.contextId ?? randomUUID();
    const parts = [{ kind: "text", text: replyFor(found) }, { kind: "data", data: { shipments: found } }];
    return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: { kind: "message", role: "agent", messageId: randomUUID(), contextId, parts } });
  };
}

/** Starts the partner agent; port 0 picks a free one. */
export function startPartner(options: PartnerOptions) {
  return Bun.serve({ port: options.port, hostname: options.hostname ?? "127.0.0.1", fetch: partnerFetch(options) });
}
