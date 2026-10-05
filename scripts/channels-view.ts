import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Sent } from "./channels-sim";

const SHOTS = path.join(process.cwd(), ".shots");
const SOURCE = process.argv[2] ?? path.join(SHOTS, "f11-transcript.json");
const ADAPTIVE_CARDS_JS = "https://cdn.jsdelivr.net/npm/adaptivecards@3.0.6/dist/adaptivecards.min.js";

type Step = { step: string; channel: "teams" | "line"; sent: Sent[] };
type Bubble = { step: string; kind: "teams-card" | "teams-text" | "line-flex" | "line-text"; payload: unknown };

function bubblesOf(step: Step): Bubble[] {
  return step.sent.flatMap((entry): Bubble[] => {
    const body = entry.body as { type?: string; text?: string; attachments?: { content: unknown }[]; messages?: { type: string; text?: string; contents?: unknown }[] };
    if (entry.channel === "teams" && entry.kind === "message") return body.attachments?.length ? body.attachments.map((attachment) => ({ step: step.step, kind: "teams-card", payload: attachment.content })) : [{ step: step.step, kind: "teams-text", payload: body.text ?? "" }];
    if (entry.channel === "line" && (entry.kind === "reply" || entry.kind === "push")) return (body.messages ?? []).map((message) => (message.type === "flex" ? { step: step.step, kind: "line-flex", payload: message.contents } : { step: step.step, kind: "line-text", payload: message.text ?? "" }));
    return [];
  });
}

const steps = JSON.parse(readFileSync(SOURCE, "utf8")) as Step[];
const bubbles = steps.flatMap(bubblesOf);
for (const bubble of bubbles) if (bubble.kind === "teams-card" || bubble.kind === "line-flex") writeFileSync(path.join(SHOTS, `f11-${bubble.step}.json`), JSON.stringify(bubble.payload, null, 2));

const html = `<!doctype html><meta charset="utf-8"><title>mascop channels</title>
<script src="${ADAPTIVE_CARDS_JS}"></script>
<style>
body{margin:0;font:14px "Segoe UI",system-ui,sans-serif;background:#f5f5f5;color:#242424}
main{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:100vh}
section{padding:20px 24px}section.teams{background:#f5f5f5}section.line{background:#8cabd9}
h1{font-size:15px;margin:0 0 14px;font-weight:600}section.line h1{color:#fff}
.item{margin:0 0 18px}.step{font:11px ui-monospace,monospace;color:#616161;margin:0 0 4px}section.line .step{color:#eef}
.teams .msg{background:#fff;border-radius:6px;box-shadow:0 1px 2px #0002;padding:12px 14px;max-width:560px}
.line .msg{background:#fff;border-radius:18px;padding:12px 14px;max-width:420px;white-space:pre-wrap}
.flex{background:#fff;border-radius:18px;overflow:hidden;max-width:420px;box-shadow:0 1px 2px #0002}
.fbody{padding:16px 18px;display:flex;flex-direction:column;gap:4px}.ffooter{padding:6px 12px 12px;display:flex;flex-direction:column;gap:6px}
.fbtn{border-radius:8px;padding:9px;text-align:center;font-weight:600;font-size:13px}.fbtn.primary{color:#fff}.fbtn.secondary{background:#eceff3}.fbtn.link{color:#4f46e5}
.fsep{border-top:1px solid #e2e8f0;margin:10px 0 4px}.frow{display:flex;gap:12px}.frow>*{min-width:0}
</style>
<main><section class="teams"><h1>Microsoft Teams (Bot Framework simulator)</h1><div id="teams"></div></section><section class="line"><h1>LINE (Messaging API simulator)</h1><div id="line"></div></section></main>
<script>
const bubbles = ${JSON.stringify(bubbles)};
const SIZES = {xxs:10,xs:11,sm:13,md:14,lg:16,xl:18,xxl:24};
function flexNode(node){
  if(node.type==="separator"){const d=document.createElement("div");d.className="fsep";return d;}
  if(node.type==="text"){const d=document.createElement("div");d.textContent=node.text;d.style.fontSize=(SIZES[node.size]||14)+"px";d.style.color=node.color||"#111";if(node.weight==="bold")d.style.fontWeight="700";if(node.align==="end")d.style.textAlign="right";if(node.flex)d.style.flex=node.flex;if(node.margin)d.style.marginTop=(node.margin==="lg"?12:node.margin==="md"?8:4)+"px";return d;}
  if(node.type==="box"){const d=document.createElement("div");d.className=node.layout==="horizontal"?"frow":"";d.style.display="flex";d.style.flexDirection=node.layout==="horizontal"?"row":"column";if(node.flex)d.style.flex=node.flex;if(node.margin)d.style.marginTop="4px";node.contents.forEach(c=>d.appendChild(flexNode(c)));return d;}
  if(node.type==="button"){const d=document.createElement("div");d.className="fbtn "+(node.style||"link");if(node.color&&node.style==="primary")d.style.background=node.color;d.textContent=node.action.label;return d;}
  return document.createElement("div");
}
function flexBubble(b){const w=document.createElement("div");w.className="flex";const body=document.createElement("div");body.className="fbody";b.body.contents.forEach(c=>body.appendChild(flexNode(c)));w.appendChild(body);if(b.footer){const f=document.createElement("div");f.className="ffooter";b.footer.contents.forEach(c=>f.appendChild(flexNode(c)));w.appendChild(f);}return w;}
for(const b of bubbles){
  const item=document.createElement("div");item.className="item";const label=document.createElement("div");label.className="step";label.textContent=b.step;item.appendChild(label);
  if(b.kind==="teams-card"){const card=new AdaptiveCards.AdaptiveCard();card.hostConfig=new AdaptiveCards.HostConfig({fontFamily:"Segoe UI, system-ui, sans-serif"});card.parse(b.payload);const m=document.createElement("div");m.className="msg";m.appendChild(card.render());item.appendChild(m);}
  else if(b.kind==="line-flex"){item.appendChild(flexBubble(b.payload));}
  else{const m=document.createElement("div");m.className="msg";m.textContent=b.payload;item.appendChild(m);}
  document.getElementById(b.kind.startsWith("teams")?"teams":"line").appendChild(item);
}
</script>`;
writeFileSync(path.join(SHOTS, "f11-view.html"), html);
console.log(`wrote .shots/f11-view.html with ${bubbles.length} messages, and one JSON file per card`);
