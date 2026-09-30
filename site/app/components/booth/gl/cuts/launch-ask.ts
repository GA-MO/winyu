import { BRAND, BRAND_GRADIENT, mark, overlayElement } from "../kit";
import { askCopy, BEAT, HEADINGS } from "./launch-data";
import { clamp01, lerp, type Beat, type Stage } from "./launch-rig";
import { checkMark, DANGER, frosted, headingBlock, INK, logoTile, MUTED, roleText, setAlpha, showHeading, showMoving, SUCCESS, textElement } from "./launch-type";

const B = BEAT.ask;
const COMPOSER = { width: 1120, height: 112, cy: 590 };
const BUBBLE_TOP = 318;
const TYPE_AT = B + 0.85;
const TYPE_STEP = 0.058;
const PIPE_TOP = 424;
const PIPE_ROW = 88;
const PIPE_AT = B + 3.5;
const PIPE_STEP = 0.55;
const BEAD = 54;
const RAIL_X = 120 + BEAD / 2;
const VALUE_X = 640;
const CARD_SCALE = 1.4;
const CARD_TOP = 330;
const RIGHT = 1160;
const MONO = '"JetBrains Mono", "Noto Sans Thai", ui-monospace, monospace';

function graphemes(text: string): string[] {
  return [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
}

function writeScript(stage: Stage, steps: number) {
  const t = stage.tracks;
  t.to("ask.head", 1, B, 0.9, "none");
  t.to("ask.role", 1, B + 0.2, 0.6, "expo.out");
  t.to("ask.composer", 1, B + 0.1, 0.9, "expo.out");
  t.to("ask.typed", 1, TYPE_AT, 1.75, "none");
  t.to("ask.send", 1, B + 2.7, 0.3, "power2.out");
  t.to("ask.dock", 1, B + 2.85, 0.75, "power3.inOut");
  t.to("ask.checking", 1, B + 3.2, 0.6, "expo.out");
  for (let index = 0; index < steps; index += 1) {
    t.to(`ask.row${index}`, 1, B + 3.3 + index * 0.06, 0.5, "expo.out");
    t.to(`ask.lit${index}`, 1, PIPE_AT + index * PIPE_STEP, 0.35, "power2.out");
    t.to(`ask.value${index}`, 1, PIPE_AT + index * PIPE_STEP + 0.1, 0.5, "expo.out");
  }
  t.to("ask.rail", 1, PIPE_AT, steps * PIPE_STEP, "none");
  t.to("ask.scopeNote", 1, PIPE_AT + 3 * PIPE_STEP + 0.35, 0.4, "back.out(2)");
  t.to("ask.pipeOut", 1, B + 7.5, 0.5, "power2.in");
  t.to("ask.card", 1, B + 7.6, 1.0, "expo.out");
  t.to("ask.callout", 1, B + 8.5, 0.7, "expo.out");
  t.to("ask.leader", 1, B + 8.75, 0.5, "power2.out");
  t.to("ask.footer", 1, B + 9.3, 0.7, "expo.out");
  t.to("ask.exit", 1, BEAT.learn - 0.6, 0.5, "power2.in");
}

/** Beat 02: the CEO types a real question, Winyu checks it through the six steps of one number, and the real answer card lands. */
export async function buildAsk(stage: Stage): Promise<Beat> {
  const copy = askCopy();
  writeScript(stage, copy.journey.length);
  const { tracks, overlay, camera, crops, shots, scene } = stage;
  const get = tracks.get;
  const layer = overlayElement(overlay, { inset: "0" });
  const heading = headingBlock(layer, HEADINGS.ask);

  const role = roleText(layer, copy.who, { left: "0", top: `${COMPOSER.cy - COMPOSER.height / 2 - 76}px` });
  const halo = overlayElement(layer, { left: `${960 - COMPOSER.width / 2 - 3}px`, top: `${COMPOSER.cy - COMPOSER.height / 2 - 3}px`, width: `${COMPOSER.width + 6}px`, height: `${COMPOSER.height + 6}px`, borderRadius: "38px", background: `conic-gradient(from 0deg, ${BRAND.indigo}, ${BRAND.violet}, ${BRAND.coral}, #38bdf8, ${BRAND.indigo})`, boxShadow: "0 40px 90px -40px rgba(124,58,237,0.55)", opacity: "0" });
  const composer = overlayElement(halo, { left: "3px", top: "3px", right: "3px", bottom: "3px", borderRadius: "35px", background: "#ffffff" });
  const typed = textElement(composer, "", { left: "44px", top: "24px", fontSize: "44px", fontWeight: "500" });
  const caret = overlayElement(composer, { top: "30px", width: "3px", height: "52px", background: INK });
  const send = overlayElement(composer, { right: "18px", top: "18px", width: "70px", height: "70px", borderRadius: "999px", background: BRAND_GRADIENT, display: "grid", placeItems: "center" });
  send.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';
  const clusters = graphemes(copy.question);

  const bubble = textElement(layer, copy.question, { right: "120px", top: `${BUBBLE_TOP}px`, fontSize: "40px", fontWeight: "600", background: "rgba(79,70,229,0.09)", border: "1px solid rgba(79,70,229,0.16)", borderRadius: "30px 30px 10px 30px", padding: "12px 34px 16px", opacity: "0" });

  const checking = overlayElement(layer, { left: "120px", top: `${BUBBLE_TOP + 4}px`, display: "flex", alignItems: "center", gap: "20px", opacity: "0" });
  logoTile(checking, 56, { position: "relative" });
  textElement(checking, copy.checking, { position: "relative", fontSize: "40px", fontWeight: "700" });

  const railTrack = overlayElement(layer, { left: `${RAIL_X - 2}px`, top: `${PIPE_TOP + PIPE_ROW / 2}px`, width: "4px", height: `${PIPE_ROW * (copy.journey.length - 1)}px`, borderRadius: "4px", background: "rgba(92,101,119,0.16)", opacity: "0" });
  const railFill = overlayElement(railTrack, { left: "0", top: "0", width: "4px", height: "100%", borderRadius: "4px", background: `linear-gradient(180deg, ${BRAND.indigo}, ${BRAND.violet} 55%, ${BRAND.coral})`, transformOrigin: "50% 0", transform: "scaleY(0)", boxShadow: "0 0 18px rgba(124,58,237,0.55)" });
  const railHead = overlayElement(railTrack, { left: "-9px", width: "22px", height: "22px", borderRadius: "999px", background: "#ffffff", boxShadow: `0 0 0 5px ${BRAND.violet}, 0 0 30px 8px rgba(124,58,237,0.55)`, opacity: "0" });

  const rows = copy.journey.map((title, index) => {
    const top = PIPE_TOP + index * PIPE_ROW;
    const row = overlayElement(layer, { left: "120px", top: `${top}px`, height: `${PIPE_ROW}px`, right: "120px", opacity: "0" });
    const dim = overlayElement(row, { left: "0", top: `${(PIPE_ROW - BEAD) / 2}px`, width: `${BEAD}px`, height: `${BEAD}px`, borderRadius: "999px", background: "#ffffff", border: "2px solid rgba(92,101,119,0.22)", boxSizing: "border-box", display: "grid", placeItems: "center", fontSize: "26px", fontWeight: "700", color: MUTED, fontFamily: '"Inter",sans-serif' });
    dim.textContent = String(index + 1);
    const lit = overlayElement(row, { left: "0", top: `${(PIPE_ROW - BEAD) / 2}px`, width: `${BEAD}px`, height: `${BEAD}px`, borderRadius: "999px", background: BRAND_GRADIENT, display: "grid", placeItems: "center", fontSize: "26px", fontWeight: "800", color: "#ffffff", fontFamily: '"Inter",sans-serif', opacity: "0", boxShadow: "0 0 0 8px rgba(124,58,237,0.12), 0 12px 26px -8px rgba(124,58,237,0.7)" });
    lit.textContent = String(index + 1);
    const label = textElement(row, title, { left: `${BEAD + 28}px`, top: `${(PIPE_ROW - 56) / 2}px`, fontSize: "40px", fontWeight: "700", color: MUTED });
    const value = copy.values[index];
    const code = value.includes(":") && /^[a-z]/u.test(value);
    const chip = overlayElement(row, { left: `${VALUE_X - 120}px`, top: `${(PIPE_ROW - 66) / 2}px`, height: "66px", display: "flex", alignItems: "center", gap: "16px", padding: "0 26px", borderRadius: "18px", background: code ? "rgba(79,70,229,0.07)" : "rgba(255,255,255,0.86)", border: `1px solid ${code ? "rgba(79,70,229,0.2)" : "rgba(79,70,229,0.12)"}`, boxShadow: "0 16px 34px -26px rgba(49,46,129,0.5)", whiteSpace: "nowrap", opacity: "0" });
    if (!code && index > 0) checkMark(chip, 34);
    textElement(chip, value, { position: "relative", fontSize: code ? "36px" : "40px", fontWeight: code ? "500" : "600", color: code ? BRAND.indigo : INK, ...(code ? { fontFamily: MONO } : {}) });
    const note = code && value.startsWith("scope") ? textElement(chip, copy.queryNote, { position: "relative", fontSize: "30px", fontWeight: "700", color: SUCCESS, background: "rgba(5,150,105,0.1)", borderRadius: "999px", padding: "2px 16px 5px", opacity: "0" }) : null;
    return { row, lit, label, chip, note };
  });

  const cardRegion = { ...mark("chat-ceo", "card"), h: 414 };
  const padRegion = { ...cardRegion, x: cardRegion.x - 6, y: cardRegion.y - 6, w: cardRegion.w + 12, h: cardRegion.h + 12 };
  const card = await crops.plane(shots["chat-ceo"], padRegion, 20);
  scene.add(card.mesh);
  const cardWidth = padRegion.w * CARD_SCALE;
  const cardHeight = padRegion.h * CARD_SCALE;
  const cardCx = 120 + cardWidth / 2;
  const cardCy = CARD_TOP + cardHeight / 2;
  const barsMark = mark("chat-ceo", "bars");
  const lowestY = CARD_TOP + (barsMark.y + 14 - padRegion.y) * CARD_SCALE;
  const lowestX = 120 + (barsMark.x + barsMark.w + 10 - padRegion.x) * CARD_SCALE;

  const callout = overlayElement(layer, { left: `${RIGHT}px`, top: `${Math.round(lowestY - 130)}px`, display: "flex", flexDirection: "column", gap: "0px", opacity: "0" });
  textElement(callout, copy.lowest.name, { position: "relative", fontSize: "48px", fontWeight: "700" });
  textElement(callout, copy.lowest.value, { position: "relative", fontSize: "132px", fontWeight: "800", color: DANGER, letterSpacing: "-0.04em", lineHeight: "1.05", fontVariantNumeric: "tabular-nums" });
  const leader = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leader.setAttribute("width", "1920");
  leader.setAttribute("height", "1080");
  Object.assign(leader.style, { position: "absolute", left: "0", top: "0", overflow: "visible", opacity: "0" });
  leader.innerHTML = `<line stroke="${DANGER}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9"/><circle r="9" fill="${DANGER}"/>`;
  layer.append(leader);
  const leaderLine = leader.querySelector("line") as SVGLineElement;
  const leaderDot = leader.querySelector("circle") as SVGCircleElement;

  const footer = frosted(layer, { left: `${RIGHT}px`, top: "720px", padding: "26px 36px 30px", display: "flex", flexDirection: "column", gap: "4px" });
  const footerHead = overlayElement(footer, { position: "relative", display: "flex", alignItems: "center", gap: "16px" });
  overlayElement(footerHead, { position: "relative", width: "16px", height: "16px", borderRadius: "999px", background: SUCCESS, boxShadow: "0 0 0 7px rgba(5,150,105,0.14)", flex: "none" });
  textElement(footerHead, copy.footer[0], { position: "relative", fontSize: "40px", fontWeight: "600" });
  textElement(footer, copy.footer[1], { position: "relative", fontSize: "40px", fontWeight: "400", color: MUTED, paddingLeft: "32px" });

  function drawComposer(exit: number) {
    const enter = get("ask.composer");
    const dock = get("ask.dock");
    const bubbleWidth = bubble.offsetWidth;
    const toX = 1800 - bubbleWidth / 2 - 960;
    const toY = BUBBLE_TOP + bubble.offsetHeight / 2 - COMPOSER.cy;
    const alpha = clamp01(enter * 1.4) * (1 - clamp01((dock - 0.35) / 0.4));
    setAlpha(halo, alpha * (1 - exit));
    halo.style.transform = `perspective(1600px) translate(${(dock * toX).toFixed(1)}px, ${((1 - enter) * 120 + dock * toY).toFixed(1)}px) rotateX(${((1 - enter) * 28).toFixed(2)}deg) scale(${lerp(1, bubbleWidth / COMPOSER.width, dock).toFixed(3)})`;
    halo.style.background = `conic-gradient(from ${(get("ask.typed") * 200 + dock * 90).toFixed(1)}deg, ${BRAND.indigo}, ${BRAND.violet}, ${BRAND.coral}, #38bdf8, ${BRAND.indigo})`;
    const count = Math.round(clusters.length * get("ask.typed"));
    typed.textContent = clusters.slice(0, count).join("");
    caret.style.left = `${44 + typed.offsetWidth + 4}px`;
    caret.style.opacity = count < clusters.length || Math.floor(get("ask.send") * 3) % 2 === 0 ? "1" : "0";
    const press = get("ask.send");
    send.style.transform = `scale(${(1 - 0.14 * Math.sin(press * Math.PI)).toFixed(3)})`;
    role.style.left = `${960 - role.offsetWidth / 2}px`;
    showMoving(role, get("ask.role"), clamp01(dock * 1.5), 20);
    const bubbleIn = clamp01((dock - 0.4) / 0.4);
    showMoving(bubble, bubbleIn, exit, 30, `translateX(${(-exit * 420).toFixed(1)}px)`);
  }

  function drawPipeline() {
    const out = get("ask.pipeOut");
    showMoving(checking, get("ask.checking"), out, 20);
    const rail = get("ask.rail");
    setAlpha(railTrack, clamp01(get("ask.row0")) * (1 - out));
    const steps = copy.journey.length;
    const fill = clamp01((rail * steps - 0.5) / (steps - 1));
    railFill.style.transform = `scaleY(${fill.toFixed(4)})`;
    railHead.style.top = `${(fill * PIPE_ROW * (steps - 1) - 11).toFixed(1)}px`;
    setAlpha(railHead, rail > 0 && rail < 1 ? 1 : 0);
    rows.forEach((item, index) => {
      const enter = get(`ask.row${index}`);
      setAlpha(item.row, clamp01(enter) * (1 - out));
      item.row.style.transform = `translateX(${((1 - enter) * 30 - out * 60).toFixed(1)}px)`;
      const lit = get(`ask.lit${index}`);
      setAlpha(item.lit, lit);
      item.lit.style.transform = `scale(${(1 + 0.25 * Math.sin(lit * Math.PI)).toFixed(3)})`;
      item.label.style.color = lit > 0.5 ? INK : MUTED;
      const value = get(`ask.value${index}`);
      setAlpha(item.chip, value);
      item.chip.style.transform = `translateX(${((1 - value) * 40).toFixed(1)}px)`;
      if (item.note) {
        const note = get("ask.scopeNote");
        setAlpha(item.note, note);
        item.note.style.transform = `scale(${lerp(0.6, 1, note).toFixed(3)})`;
      }
    });
  }

  function drawAnswer(exit: number) {
    const enter = get("ask.card");
    const fromY = PIPE_TOP + (copy.journey.length - 0.5) * PIPE_ROW;
    card.place(camera, { cx: lerp(RAIL_X + 40, cardCx, enter) - exit * 420, cy: lerp(fromY, cardCy, enter), w: lerp(80, cardWidth, enter), alpha: clamp01(enter * 2) * (1 - exit), rotX: lerp(0.5, 0, enter), depth: 9 });
    const calloutIn = get("ask.callout");
    showMoving(callout, calloutIn, exit, 30, `translateX(${(-exit * 420).toFixed(1)}px)`);
    const reach = get("ask.leader") * (1 - exit);
    const endX = RIGHT - 24;
    const endY = lowestY;
    leaderLine.setAttribute("x1", lowestX.toFixed(1));
    leaderLine.setAttribute("y1", lowestY.toFixed(1));
    leaderLine.setAttribute("x2", lerp(lowestX, endX, reach).toFixed(1));
    leaderLine.setAttribute("y2", lerp(lowestY, endY, reach).toFixed(1));
    leaderDot.setAttribute("cx", lowestX.toFixed(1));
    leaderDot.setAttribute("cy", lowestY.toFixed(1));
    setAlpha(leader, clamp01(reach * 3) * (1 - clamp01(exit * 3)));
    showMoving(footer, get("ask.footer"), exit, 30, `translateX(${(-exit * 420).toFixed(1)}px)`);
  }

  return {
    draw() {
      const exit = get("ask.exit");
      showHeading(heading, get("ask.head"), exit);
      drawComposer(exit);
      drawPipeline();
      drawAnswer(exit);
    },
  };
}
