import type { FilmHost } from "../film";
import { createCamera, createRenderer, shotInfo, THREE, type ShotId } from "../kit";
import { glStage } from "../stage";
import { LAUNCH_LENGTH } from "./launch-data";
import { buildIntro } from "./launch-intro";
import { buildInvestigate } from "./launch-investigate";
import { buildAsk } from "./launch-ask";
import { buildProduct } from "./launch-product";
import { buildAct } from "./launch-act";
import { buildTrust } from "./launch-trust";
import { createCropStore, createTracks, type Beat, type Stage } from "./launch-rig";
import { createLaunchBackdrop } from "./launch-world";
import { applyPose } from "./signal-rig";

/** Loop length of the launch cut, in seconds. */
export const LAUNCH_SECONDS = LAUNCH_LENGTH;

const FONT_PROBES = ['700 84px "Noto Sans Thai"', '600 40px "Noto Sans Thai"', '500 40px "Noto Sans Thai"', '800 150px "Inter"', '700 84px "Inter"', '600 40px "Inter"'];
const SHOT_IDS: ShotId[] = ["story", "story-ceo", "story-cfo", "story-rsm", "story-rep", "chat-ceo", "chat-forecast", "landing-rep", "memory", "memory-yes", "dashboard-suggest"];

async function fontsReady() {
  await Promise.all(FONT_PROBES.map((probe) => document.fonts.load(probe, "กW")));
  await document.fonts.ready;
}

async function createLaunch(host: FilmHost) {
  await fontsReady();
  const renderer = createRenderer(host.canvas);
  renderer.setClearColor("#f7f7fb", 1);
  const scene = new THREE.Scene();
  const camera = createCamera(35);
  const backdrop = createLaunchBackdrop(LAUNCH_SECONDS);
  scene.add(backdrop);
  const tracks = createTracks(LAUNCH_SECONDS);
  const shots = Object.fromEntries(SHOT_IDS.map((id) => [id, { src: shotInfo(id).src }])) as Stage["shots"];
  Object.assign(host.overlay.style, { fontFamily: '"Inter","Noto Sans Thai",sans-serif', overflow: "hidden" });
  const stage: Stage = { scene, camera, overlay: host.overlay, tracks, crops: createCropStore(renderer), shots };
  const beats: Beat[] = [buildIntro(stage), await buildInvestigate(stage), await buildAsk(stage), await buildProduct(stage)];
  const act = buildAct(stage);
  beats.push(act, await buildTrust(stage));
  renderer.compile(scene, camera);

  return {
    render(t: number) {
      const time = ((t % LAUNCH_SECONDS) + LAUNCH_SECONDS) % LAUNCH_SECONDS;
      tracks.seek(time);
      backdrop.material.uniforms.uTime.value = time;
      applyPose(camera, tracks.pose("cam"), 1920, 1080);
      for (const beat of beats) beat.draw(time);
      renderer.render(scene, camera);
    },
    dispose() {
      tracks.kill();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      stage.crops.dispose();
      renderer.dispose();
    },
  };
}

/** The "launch" film: the saas-light story of twelve beats told in the signal cut's light glass language. */
export const LaunchStage = glStage(createLaunch);
