import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../sequence";
import { holdCapture, type Film, type FilmFactory, type FilmHost } from "./film";

type StageProps = { t: number; scale: number };

function mountHost(container: HTMLDivElement): FilmHost {
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  Object.assign(canvas.style, { position: "absolute", inset: "0", display: "block", width: `${STAGE_WIDTH}px`, height: `${STAGE_HEIGHT}px` });
  const overlay = document.createElement("div");
  Object.assign(overlay.style, { position: "absolute", inset: "0", pointerEvents: "none", fontFamily: '"Inter", "Noto Sans Thai", sans-serif' });
  container.append(canvas, overlay);
  return { canvas, overlay, width: STAGE_WIDTH, height: STAGE_HEIGHT };
}

/** Wraps a WebGL film as a booth stage: gives each mount its own canvas and type layer, waits for the film to load, and draws it at t. */
export function glStage(factory: FilmFactory): ComponentType<StageProps> {
  return function GlStage({ t, scale }: StageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [film, setFilm] = useState<Film | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const host = mountHost(container);
      let active = true;
      const loading = factory(host).then((made) => {
        if (active) setFilm(made);
        return made;
      });
      holdCapture(loading);
      return () => {
        active = false;
        setFilm(null);
        void loading.then((made) => made.dispose());
        host.canvas.remove();
        host.overlay.remove();
      };
    }, []);

    useLayoutEffect(() => {
      if (!film) return;
      film.render(t);
      document.body.dataset.boothFrame = String(t);
    }, [film, t]);

    return <div ref={containerRef} className="relative overflow-hidden bg-black" style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }} />;
  };
}
