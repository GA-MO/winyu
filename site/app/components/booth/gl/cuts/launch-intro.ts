import { BRAND_GRADIENT, FACTS, overlayElement, THREE } from "../kit";
import { BEAT, LAUNCH_LENGTH, STATEMENTS, systemTiles, TRACE_CARD } from "./launch-data";
import { clamp01, lerp, placeFacing, type Beat, type Stage } from "./launch-rig";
import { gradientAcross, kineticBlock, MUTED, setAlpha, showKinetic, textElement } from "./launch-type";
import { createLogo } from "./signal-materials";
import { poseLooking, type Pose } from "./signal-rig";

const HOOK_DISTANCE = 24;
const LOGO_SIZE = 250;
const LOGO_Y = 420;
const LOCKUP_TILE = 150;
const LOCKUP_Y = 405;
const GATHER = { x: 960, y: 560 };
const END = LAUNCH_LENGTH;
const SLOT_TOP = 316;
const SLOT_HEIGHT = 64;
const ROLL_IDS = ["u_thana", "u_siriporn", "u_prasit", "u_may", "u_wee", "u_fah", "u_mint", "u_anucha", "u_krit"];
const ROLL_STARTS = [0, 0.7, 0.95, 1.2, 1.48, 1.8, 2.18, 2.63, 3.2];
const ROLL_BLEND = 0.24;
const TILE_ROWS = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15]];
const TILE_ROW_TOPS = [400, 576, 752];

/** The camera pose the loop starts and ends on. */
export function hookPose(): Pose {
  return poseLooking(new THREE.Vector3(0, 0, HOOK_DISTANCE), new THREE.Vector3());
}

/** Seconds before the loop point the camera starts gliding into the hook pose, at the same speed the hook drifts on. */
export const SEAM_LEAD = 1.5;

/** Where the camera stands `SEAM_LEAD` seconds before the loop point, so the glide into frame 0 continues the hook's drift without a jolt. */
export function seamPose(): Pose {
  const start = hookPose();
  const drift = hookDriftPose();
  const back = SEAM_LEAD / BEAT.problem;
  const keys = ["az", "el", "r", "tx", "ty", "tz", "sx", "sy"] as const;
  return Object.fromEntries(keys.map((key) => [key, start[key] - (drift[key] - start[key]) * back])) as Pose;
}

function hookDriftPose(): Pose {
  return poseLooking(new THREE.Vector3(0.5, 0.2, HOOK_DISTANCE - 1.0), new THREE.Vector3(0.15, 0.05, 0));
}

function problemPose(): Pose {
  return poseLooking(new THREE.Vector3(-0.8, -0.2, HOOK_DISTANCE + 2), new THREE.Vector3(-0.1, 0, 0));
}

function roleTitleOf(userId: string): string {
  const found = FACTS.roles.find((role) => role.userId === userId);
  if (!found) throw new Error(`No role ${userId}`);
  return found.role;
}

function buildRoleSlot(parent: HTMLElement) {
  const root = overlayElement(parent, { left: "0", right: "0", top: `${SLOT_TOP}px`, height: `${SLOT_HEIGHT}px`, overflow: "hidden", opacity: "0" });
  const titles = ROLL_IDS.map((id) => {
    const row = overlayElement(root, { left: "0", right: "0", top: "0", height: `${SLOT_HEIGHT}px`, display: "flex", justifyContent: "center", alignItems: "center", gap: "18px", whiteSpace: "nowrap", opacity: "0" });
    overlayElement(row, { position: "relative", width: "14px", height: "14px", borderRadius: "999px", background: BRAND_GRADIENT, flex: "none", boxShadow: "0 0 0 6px rgba(124,58,237,0.1)" });
    textElement(row, roleTitleOf(id), { position: "relative", fontSize: "40px", fontWeight: "500", color: MUTED });
    return row;
  });
  return { root, titles };
}

function rollIndex(time: number): { index: number; blend: number } {
  if (time >= BEAT.problem) return { index: 0, blend: 1 };
  let index = 0;
  while (index + 1 < ROLL_STARTS.length && ROLL_STARTS[index + 1] <= time) index += 1;
  const blend = index === 0 ? 1 : clamp01((time - ROLL_STARTS[index]) / ROLL_BLEND);
  return { index, blend: 1 - (1 - blend) ** 2 };
}

function buildTiles(parent: HTMLElement): HTMLDivElement[] {
  const names = systemTiles();
  const tiles: HTMLDivElement[] = [];
  TILE_ROWS.forEach((indexes, rowIndex) => {
    const row = overlayElement(parent, { left: "120px", right: "120px", top: `${TILE_ROW_TOPS[rowIndex]}px`, display: "flex", justifyContent: "center", gap: "34px" });
    for (const index of indexes) {
      tiles[index] = textElement(row, names[index], {
        position: "relative",
        fontSize: "34px",
        fontWeight: "600",
        color: "#1f2433",
        letterSpacing: "-0.01em",
        padding: "16px 30px 20px",
        borderRadius: "20px",
        background: "rgba(255,255,255,0.86)",
        border: "1px solid rgba(92,101,119,0.14)",
        boxShadow: "0 1px 2px rgba(11,12,15,0.04), 0 26px 50px -32px rgba(31,36,51,0.45)",
        opacity: "0",
      });
    }
  });
  if (tiles.length !== names.length) throw new Error("Every system needs a tile");
  return tiles;
}

function centreOf(element: HTMLElement): { x: number; y: number } {
  let x = element.offsetWidth / 2;
  let y = element.offsetHeight / 2;
  let node: HTMLElement | null = element;
  while (node && node.offsetParent) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement;
  }
  return { x, y };
}

function writeScript(stage: Stage) {
  const { tracks } = stage;
  tracks.definePose("cam", hookPose());
  tracks.define("hook.enter1", 1);
  tracks.define("hook.slot", 1);
  tracks.poseTo("cam", hookDriftPose(), 0, BEAT.problem, "none");
  tracks.to("hook.enter2", 1, 0.35, 1.1, "none");
  tracks.to("hook.exit", 1, 4.85, 0.4, "power2.in");
  tracks.to("hook.slot", 0, 4.85, 0.4, "power2.in");
  tracks.poseTo("cam", problemPose(), BEAT.problem, 5.0, "power1.inOut");
  tracks.to("problem.head", 1, 5.2, 0.9, "none");
  systemTiles().forEach((_, index) => tracks.to(`tile${index}.in`, 1, 5.5 + index * 0.075, 0.9, "expo.out"));
  tracks.to("problem.exit", 1, 9.85, 0.4, "power2.in");
  tracks.to("tiles.gather", 1, 9.95, 1.05, "power3.in");
  tracks.to("flash", 1, 10.8, 0.25, "power2.out");
  tracks.to("flash", 0, 11.05, 0.9, "power2.out");
  tracks.to("logo.alpha", 1, 10.85, 0.2, "none");
  tracks.to("logo.tile", 1, 10.9, 0.7, "expo.out");
  tracks.to("logo.draw", 1, 11.2, 0.95, "power2.inOut");
  tracks.to("logo.dot", 1, 12.05, 0.35, "back.out(2.2)");
  tracks.to("brand.word", 1, 12.2, 0.7, "expo.out");
  tracks.to("brand.tagline", 1, 12.6, 0.7, "expo.out");
  tracks.to("brand.exit", 1, 15.15, 0.4, "power2.in");
  tracks.to("logo.dock", 1, 15.3, 0.95, "power3.inOut");
  tracks.to("logo.alpha", 0, 16.25, 0.15, "none");
  tracks.poseTo("cam", hookPose(), 16.3, 0.01, "none");

  tracks.to("end.lockup", 1, BEAT.end + 0.15, 0.8, "expo.out");
  tracks.to("end.line1", 1, BEAT.end + 0.55, 0.8, "none");
  tracks.to("end.line2", 1, BEAT.end + 0.85, 1.0, "none");
  tracks.to("end.exit", 1, END - 1.95, 0.45, "power2.in");
  tracks.to("end.lockupOut", 1, END - 1.9, 0.5, "power2.in");
  tracks.to("hook.slot", 1, END - 0.85, 0.75, "power2.out");
  tracks.to("hook.exit", 0, BEAT.end + 0.1, 0.01, "none");
  tracks.to("hook.enter1", 0, BEAT.end + 0.1, 0.01, "none");
  tracks.to("hook.enter2", 0, BEAT.end + 0.1, 0.01, "none");
  tracks.to("hook.enter1", 1, END - 1.4, 1.35, "none");
}

/** The hook, the problem, the reveal and the end lockup, which hands back to the hook so the loop has no seam. */
export function buildIntro(stage: Stage): Beat {
  writeScript(stage);
  const { tracks, overlay, scene, camera } = stage;
  const get = tracks.get;
  const layer = overlayElement(overlay, { inset: "0" });

  const slot = buildRoleSlot(layer);
  const tiles = buildTiles(layer);
  const tileHomes = tiles.map(centreOf);

  const hookHead = kineticBlock(layer, [
    { text: STATEMENTS.hook[0], style: { fontSize: "124px", fontWeight: "700", letterSpacing: "-0.02em", textAlign: "center" } },
    { text: STATEMENTS.hook[1], style: { fontSize: "124px", fontWeight: "700", letterSpacing: "-0.02em", textAlign: "center" } },
  ], { left: "0", right: "0", top: "420px", alignItems: "center", gap: "0px" });
  gradientAcross(hookHead, 1);
  const hookLine1 = { root: hookHead.root, words: hookHead.words.slice(0, (hookHead.root.children[0] as HTMLElement).children.length) };
  const hookLine2 = { root: hookHead.root, words: hookHead.words.slice(hookLine1.words.length) };

  const problemHead = kineticBlock(layer, [{ text: STATEMENTS.problem, style: { fontSize: "84px", fontWeight: "700", letterSpacing: "-0.01em" } }], { left: "0", right: "0", top: "110px", alignItems: "center" });

  const flash = overlayElement(layer, { left: `${GATHER.x - 700}px`, top: `${GATHER.y - 700}px`, width: "1400px", height: "1400px", borderRadius: "999px", background: "radial-gradient(circle, rgba(124,58,237,0.42), rgba(251,113,133,0.14) 38%, rgba(247,247,251,0) 68%)", opacity: "0" });

  const logo = createLogo(1);
  logo.renderOrder = 30;
  logo.material.depthTest = false;
  scene.add(logo);

  const word = textElement(layer, "Winyu", { left: "0", right: "0", top: `${LOGO_Y + LOGO_SIZE / 2 + 34}px`, textAlign: "center", fontSize: "150px", fontWeight: "800", letterSpacing: "-0.045em", lineHeight: "1.1", opacity: "0" });
  const tagline = textElement(layer, STATEMENTS.tagline, { left: "0", right: "0", top: `${LOGO_Y + LOGO_SIZE / 2 + 222}px`, textAlign: "center", fontSize: "52px", fontWeight: "500", color: MUTED, opacity: "0" });

  const lockupWord = textElement(layer, "Winyu", { left: "0", top: `${LOCKUP_Y - 84}px`, fontSize: "150px", fontWeight: "800", letterSpacing: "-0.045em", lineHeight: "1.1", opacity: "0" });
  const endLines = kineticBlock(layer, [
    { text: STATEMENTS.end[0], style: { fontSize: "84px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: "1.12" } },
    { text: STATEMENTS.end[1], style: { fontSize: "84px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: "1.12" } },
  ], { left: "0", right: "0", top: "586px", alignItems: "center" });
  gradientAcross(endLines, 1);
  const endLine1 = { root: endLines.root, words: endLines.words.slice(0, (endLines.root.children[0] as HTMLElement).children.length) };
  const endLine2 = { root: endLines.root, words: endLines.words.slice(endLine1.words.length) };

  function drawHook(time: number) {
    const { index, blend } = rollIndex(time);
    setAlpha(slot.root, get("hook.slot"));
    slot.titles.forEach((title, at) => {
      const current = at === index;
      const previous = at === index - 1 && blend < 1;
      const incoming = clamp01(blend * 2 - 1);
      const outgoing = clamp01(1 - blend * 2);
      const alpha = current ? incoming : previous ? outgoing : 0;
      title.style.opacity = alpha.toFixed(3);
      title.style.transform = `translateY(${(current ? (1 - incoming) * 22 : previous ? -(1 - outgoing) * 22 : 0).toFixed(1)}px)`;
    });
    const exit = get("hook.exit");
    showKinetic(hookLine1 as never, get("hook.enter1"), exit);
    const secondEnter = get("hook.enter2");
    hookLine2.words.forEach((element, index) => {
      const local = clamp01(secondEnter * (1 + 0.28 * (hookLine2.words.length - 1)) - index * 0.28);
      const eased = 1 - (1 - local) ** 3;
      element.style.opacity = eased.toFixed(3);
      element.style.transform = `translateY(${((1 - eased) * 16).toFixed(1)}%)`;
    });
  }

  function drawProblem() {
    const head = get("problem.head");
    showKinetic(problemHead, head, get("problem.exit"));
    const gather = get("tiles.gather");
    tiles.forEach((tile, index) => {
      const enter = get(`tile${index}.in`);
      const staggered = clamp01(gather * 1.25 - (index % 5) * 0.05);
      const alpha = clamp01(enter * 1.3) * (1 - clamp01((staggered - 0.55) / 0.45));
      setAlpha(tile, alpha);
      if (alpha <= 0.001) return;
      const home = tileHomes[index];
      const pull = staggered * staggered;
      tile.style.transform = `translate(${((GATHER.x - home.x) * pull).toFixed(1)}px, ${((GATHER.y - home.y) * pull + (1 - enter) * 36).toFixed(1)}px) scale(${(lerp(0.86, 1, enter) * lerp(1, 0.25, staggered)).toFixed(3)})`;
    });
    const glow = get("flash");
    setAlpha(flash, glow);
    flash.style.transform = `scale(${lerp(0.2, 1.1, glow).toFixed(3)})`;
  }

  function drawLogo() {
    const alpha = get("logo.alpha");
    const endIn = get("end.lockup");
    const endOut = get("end.lockupOut");
    const u = logo.userData.uniforms;
    if (endIn > 0 && endOut < 1) {
      const lockupWidth = LOCKUP_TILE + 36 + lockupWord.offsetWidth;
      const left = 960 - lockupWidth / 2;
      const size = LOCKUP_TILE * lerp(0.6, 1, endIn) * lerp(1, 0.9, endOut);
      const cx = left + LOCKUP_TILE / 2;
      logo.visible = true;
      u.uAlpha.value = clamp01(endIn * 2) * (1 - endOut);
      u.uTile.value = 1;
      u.uDraw.value = 1;
      u.uDot.value = 1;
      u.uWhite.value = 1;
      u.uRetract.value = 0;
      placeFacing(logo, camera, cx, LOCKUP_Y - endOut * 30, size, 1, 8);
      lockupWord.style.left = `${left + LOCKUP_TILE + 36}px`;
      setAlpha(lockupWord, clamp01(endIn) * (1 - get("end.exit")));
      lockupWord.style.transform = `translateX(${((1 - endIn) * -30).toFixed(1)}px) translateY(${(-get("end.exit") * 30).toFixed(1)}px)`;
      return;
    }
    setAlpha(lockupWord, 0);
    logo.visible = alpha > 0.003;
    if (!logo.visible) return;
    const dock = get("logo.dock");
    const iconX = TRACE_CARD.left + TRACE_CARD.pad + TRACE_CARD.icon / 2;
    const iconY = TRACE_CARD.top + TRACE_CARD.pad + TRACE_CARD.icon / 2;
    const size = lerp(LOGO_SIZE, TRACE_CARD.icon, dock) * lerp(0.55, 1, get("logo.tile"));
    u.uAlpha.value = alpha;
    u.uTile.value = get("logo.tile");
    u.uDraw.value = get("logo.draw");
    u.uDot.value = get("logo.dot");
    u.uWhite.value = 1;
    u.uRetract.value = 0;
    placeFacing(logo, camera, lerp(960, iconX, dock), lerp(LOGO_Y, iconY, dock), size, 1, 8);
  }

  function drawBrand() {
    const exit = get("brand.exit");
    const wordIn = get("brand.word");
    setAlpha(word, wordIn * (1 - exit));
    word.style.transform = `translateY(${((1 - wordIn) * 40 - exit * 40).toFixed(1)}px)`;
    const tagIn = get("brand.tagline");
    setAlpha(tagline, tagIn * (1 - exit));
    tagline.style.transform = `translateY(${((1 - tagIn) * 30 - exit * 30).toFixed(1)}px)`;
    const endExit = get("end.exit");
    showKinetic(endLine1 as never, get("end.line1"), endExit);
    const line2 = get("end.line2");
    endLine2.words.forEach((element, index) => {
      const local = clamp01(line2 * (1 + 0.28 * (endLine2.words.length - 1)) - index * 0.28);
      const eased = 1 - (1 - local) ** 3;
      element.style.opacity = eased.toFixed(3);
      element.style.transform = `translateY(${((1 - eased) * 16).toFixed(1)}%)`;
    });
  }

  return {
    draw(time: number) {
      drawHook(time);
      drawProblem();
      drawLogo();
      drawBrand();
    },
  };
}
