import { BRAND, SPARK_POINTS, THREE } from "../kit";
import { DAILY_ORDERS } from "./night-data";
import { TITLES } from "./night-titles";
import { blendShapes, createArea, createGlowDot, createRibbon, createTile, resample, type Point } from "./night-gl";
import { track } from "./night-type";

/** Where the loop's stroke starts: the tip dot sits here on frame 0 and returns here at the end. */
export const STROKE_START: Point = [160, 820];

const STROKE_END: Point = [1760, 820];
const SPARK_SAMPLES = 256;
const LOGO = { x: 960, y: 372, tile: 236 };
const LOGO_SCALE = LOGO.tile / 64;
const CHART = { left: 140, right: 1780, top: 540, bottom: 975 };
const STROKE_COLORS = ["#8f95ff", "#b18cff", "#ff8da1"].map((hex) => new THREE.Color(hex));
const WHITE = new THREE.Color("#ffffff");
const THREAD = { draw: 49.55, drawn: 50.5, morph: 51.15, morphed: 52.45, whiten: 51.9, white: 52.6, unbend: 57.25, unbent: 58.05, collapse: 58.0, collapsed: 59.3 };
const TILE = { form: 52.1, formed: 52.9, sheen: 53.0, out: 57.05, gone: 57.6 };

/** Beats of the stage-space graphics. */
export const HUD_BEATS = { ...THREAD, chart: 19.0, charted: 20.6, cliff: TITLES.beatTwo + 0.3, chartOut: 25.7, chartGone: 26.3 };

function logoPoints(): Point[] {
  return SPARK_POINTS.map(([x, y]) => [LOGO.x + (x - 32) * LOGO_SCALE, LOGO.y + (y - 32) * LOGO_SCALE] as Point);
}

function flatPoints(): Point[] {
  const points = logoPoints();
  const middle = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
  return [[points[0][0], middle], [points[points.length - 1][0], middle]];
}

function chartPoints(): Point[] {
  const peak = Math.max(...DAILY_ORDERS.litres);
  const last = DAILY_ORDERS.litres.length - 1;
  return DAILY_ORDERS.litres.map((litres, index) => [CHART.left + ((CHART.right - CHART.left) * index) / last, CHART.bottom - (litres / peak) * (CHART.bottom - CHART.top)] as Point);
}

function arcFraction(points: Point[], upTo: number): number {
  let before = 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const step = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
    total += step;
    if (index <= upTo) before += step;
  }
  return before / total;
}

type Hud = { update: (t: number, thread: () => Point[]) => void; dispose: () => void };

/** The stroke that runs through the whole loop (hook line, dawn thread, logo W), the orders chart and the logo tile. */
export function buildHud(hud: THREE.Scene, timeline: gsap.core.Timeline): Hud {
  const spark = createRibbon(SPARK_SAMPLES, ["#8f95ff", "#b18cff", "#ff8da1"], [0.5, 1]);
  const tip = createGlowDot("#ffe9ef", 200);
  const tile = createTile([BRAND.indigo, BRAND.violet, BRAND.coral]);
  tile.mesh.renderOrder = 4;
  spark.mesh.renderOrder = 5;
  tip.mesh.renderOrder = 6;

  const chart = chartPoints();
  const cliffX = chart[DAILY_ORDERS.cliffIndex][0];
  const line = createRibbon(420, ["#a5b4fc", "#c4b5fd", BRAND.coral], [arcFraction(chart, DAILY_ORDERS.cliffIndex - 1), arcFraction(chart, DAILY_ORDERS.cliffIndex)]);
  line.setPath(chart);
  const area = createArea(chart, CHART.bottom, "#7c6cf0", BRAND.coral, (chart[DAILY_ORDERS.cliffIndex - 1][0] + cliffX) / 2);
  const marker = createRibbon(8, [BRAND.coral, BRAND.coral, BRAND.coral]);
  marker.setPath([[cliffX, CHART.top - 40], [cliffX, CHART.bottom]]);
  const cliffDot = createGlowDot("#ffc2cf", 120);
  const baseline = createRibbon(8, ["#6d6fc9", "#6d6fc9", "#6d6fc9"]);
  baseline.setPath([[CHART.left, CHART.bottom], [CHART.right, CHART.bottom]]);
  hud.add(area.mesh, baseline.mesh, line.mesh, marker.mesh, cliffDot.mesh, tile.mesh, spark.mesh, tip.mesh);

  const state = { draw: 0, hookFade: 1, thread: 0, morph: 0, white: 0, unbend: 0, collapse: 0, width: 3, dot: 1, tileSize: 0, tileOpacity: 0, sheen: 0, chart: 0, chartOpacity: 0, cliff: 0 };
  track(timeline, state, "draw", [[0, 0], [0.5, 0], [4.2, 1, "power2.inOut"]]);
  track(timeline, state, "hookFade", [[0, 1], [4.6, 1], [5.25, 0, "power2.in"], [HUD_BEATS.draw - 0.1, 0], [HUD_BEATS.draw, 1, "none"]]);
  track(timeline, state, "thread", [[0, 0], [HUD_BEATS.draw, 0], [HUD_BEATS.drawn, 1, "power2.inOut"]]);
  track(timeline, state, "morph", [[0, 0], [HUD_BEATS.morph, 0], [HUD_BEATS.morphed, 1, "power3.inOut"]]);
  track(timeline, state, "white", [[0, 0], [HUD_BEATS.whiten, 0], [HUD_BEATS.white, 1, "power2.inOut"], [HUD_BEATS.unbend, 1], [HUD_BEATS.unbent, 0, "power2.inOut"]]);
  track(timeline, state, "unbend", [[0, 0], [HUD_BEATS.unbend, 0], [HUD_BEATS.unbent, 1, "power3.inOut"]]);
  track(timeline, state, "collapse", [[0, 0], [HUD_BEATS.collapse, 0], [HUD_BEATS.collapsed, 1, "power3.inOut"]]);
  track(timeline, state, "width", [[0, 3], [HUD_BEATS.draw, 3], [HUD_BEATS.drawn, 4.5], [HUD_BEATS.morph, 4.5], [HUD_BEATS.morphed, 7 * LOGO_SCALE, "power3.inOut"], [HUD_BEATS.unbent, 7 * LOGO_SCALE], [HUD_BEATS.collapsed, 3, "power3.inOut"]]);
  track(timeline, state, "dot", [[0, 1], [HUD_BEATS.morph, 1], [HUD_BEATS.morphed, 0, "power3.inOut"], [HUD_BEATS.unbend, 0], [HUD_BEATS.collapsed, 1, "power3.inOut"]]);
  track(timeline, state, "tileSize", [[0, 0], [TILE.form, 0], [TILE.formed, LOGO.tile, "back.out(1.6)"], [TILE.out, LOGO.tile], [TILE.gone, LOGO.tile * 0.6, "power2.in"]]);
  track(timeline, state, "tileOpacity", [[0, 0], [TILE.form, 0], [TILE.form + 0.3, 1, "power2.out"], [TILE.out, 1], [TILE.gone, 0, "power2.in"]]);
  track(timeline, state, "sheen", [[0, 0], [TILE.sheen, 0], [TILE.sheen + 1.2, 1, "power1.inOut"]]);
  track(timeline, state, "chart", [[0, 0], [HUD_BEATS.chart, 0], [HUD_BEATS.charted, 1, "power2.inOut"]]);
  track(timeline, state, "chartOpacity", [[0, 0], [HUD_BEATS.chart, 0], [HUD_BEATS.chart + 0.2, 1, "power2.out"], [HUD_BEATS.chartOut, 1], [HUD_BEATS.chartGone, 0, "power2.in"]]);
  track(timeline, state, "cliff", [[0, 0], [HUD_BEATS.cliff, 0], [HUD_BEATS.cliff + 0.5, 1, "power3.out"]]);

  const logo = resample(logoPoints(), SPARK_SAMPLES);
  const flat = resample(flatPoints(), SPARK_SAMPLES);
  const home = resample([STROKE_START, STROKE_START], SPARK_SAMPLES);
  const hook = resample([STROKE_START, STROKE_END], SPARK_SAMPLES);
  const colors = STROKE_COLORS.map((color) => color.clone());

  function sparkShape(t: number, thread: () => Point[]): { path: Point[]; to: number; opacity: number } | null {
    if (t < 5.3) return { path: hook, to: state.draw, opacity: state.hookFade };
    if (t < HUD_BEATS.draw) return null;
    if (t < HUD_BEATS.unbend) {
      const live = resample(thread(), SPARK_SAMPLES);
      return { path: state.morph > 0 ? blendShapes(live, logo, state.morph) : live, to: state.morph > 0 ? 1 : state.thread, opacity: 1 };
    }
    return { path: blendShapes(blendShapes(logo, flat, state.unbend), home, state.collapse), to: 1, opacity: 1 };
  }

  function drawSpark(t: number, thread: () => Point[]) {
    const shape = sparkShape(t, thread);
    if (!shape || shape.opacity <= 0.001) {
      spark.mesh.visible = false;
      tip.set(0, 0, 0, 0, 0);
      return;
    }
    colors.forEach((color, index) => color.copy(STROKE_COLORS[index]).lerp(WHITE, state.white));
    spark.tint(colors[0], colors[1], colors[2]);
    spark.setPath(shape.path);
    spark.style({ width: state.width, intensity: 1 + 0.25 * (1 - state.white), head: 0.6 * (1 - state.white), opacity: shape.opacity });
    spark.reveal(0, shape.to);
    const [x, y] = spark.sample(shape.to);
    const logoDot = 5 * LOGO_SCALE;
    const core = 7 + (logoDot - 7) * (1 - state.dot);
    const glow = shape.opacity * (1 + 3.5 * state.dot);
    tip.set(x, y, core, 26 + 14 * state.dot, glow);
  }

  function drawChart() {
    const opacity = state.chartOpacity;
    const headX = CHART.left + (CHART.right - CHART.left) * state.chart;
    line.style({ width: 4, intensity: 1.05, head: 1.4 * (1 - state.chart) + 0.2, opacity });
    line.reveal(0, state.chart);
    area.set(headX, 0.32 * opacity);
    baseline.style({ width: 1.5, intensity: 1, opacity: 0.45 * opacity });
    baseline.reveal(0, state.chart);
    marker.style({ width: 2, intensity: 1, opacity: 0.75 * opacity * state.cliff });
    marker.reveal(0, state.cliff);
    const cliffPoint = chart[DAILY_ORDERS.cliffIndex];
    cliffDot.set(cliffPoint[0], cliffPoint[1], 8, 44, 3.2 * opacity * state.cliff);
  }

  return {
    update(t, thread) {
      drawSpark(t, thread);
      drawChart();
      tile.set(LOGO.x, LOGO.y, state.tileSize, state.tileOpacity, state.sheen);
    },
    dispose() {
      [spark.mesh, tip.mesh, tile.mesh, line.mesh, area.mesh, marker.mesh, cliffDot.mesh, baseline.mesh].forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
    },
  };
}
