/** What a WebGL cut draws into: a 1920×1080 canvas and an HTML layer above it for Thai type. */
export type FilmHost = { canvas: HTMLCanvasElement; overlay: HTMLDivElement; width: number; height: number };

/** A booth film that draws itself at any time t (seconds), the same way every time. */
export type Film = { render: (t: number) => void; dispose: () => void };

/** Builds a film once its textures and fonts are loaded. */
export type FilmFactory = (host: FilmHost) => Promise<Film>;

type PendingWindow = Window & { __boothPending?: Promise<unknown>[] };

/** Registers work the capture must wait for before the first frame. */
export function holdCapture(work: Promise<unknown>): void {
  const target = window as PendingWindow;
  target.__boothPending = [...(target.__boothPending ?? []), work];
}

/** Everything cuts registered with `holdCapture`, settled. */
export async function captureHolds(): Promise<void> {
  const target = window as PendingWindow;
  await Promise.all(target.__boothPending ?? []);
}
