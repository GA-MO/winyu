export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export const FPS = 30;

export type Beat<Id extends string> = { id: Id; duration: number; index?: number };

export type ActiveBeat<Id extends string> = { id: Id; local: number; opacity: number; index: number };

export type Sequence<Id extends string> = { loopSeconds: number; at: (t: number) => ActiveBeat<Id>[] };

/** Clamps x into [0, 1]. */
export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Ease-out cubic progress of the window [from, from + span] at time t. */
export function easeIn(t: number, from: number, span: number): number {
  const p = clamp01((t - from) / span);
  return 1 - (1 - p) ** 3;
}

/** Ease-in-out cubic progress of the window [from, from + span] at time t, for camera moves that start and stop softly. */
export function easeInOut(t: number, from: number, span: number): number {
  const p = clamp01((t - from) / span);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}

/** Linear blend from a to b by p. */
export function mix(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** A looping run of beats; at any time t it returns the beat on screen plus the next one while it crossfades in. */
export function createSequence<Id extends string>(beats: Beat<Id>[], crossfade: number): Sequence<Id> {
  let start = 0;
  const placed = beats.map((beat) => {
    const item = { id: beat.id, duration: beat.duration, index: beat.index ?? 0, start };
    start += beat.duration;
    return item;
  });
  const loopSeconds = start;
  function at(t: number): ActiveBeat<Id>[] {
    const time = ((t % loopSeconds) + loopSeconds) % loopSeconds;
    const position = placed.findIndex((beat) => time < beat.start + beat.duration);
    const current = placed[position];
    const local = time - current.start;
    const active: ActiveBeat<Id>[] = [{ id: current.id, local, opacity: 1, index: current.index }];
    const fadeFrom = current.duration - crossfade;
    if (local < fadeFrom) return active;
    const next = placed[(position + 1) % placed.length];
    active.push({ id: next.id, local: 0, opacity: clamp01((local - fadeFrom) / crossfade), index: next.index });
    return active;
  }
  return { loopSeconds, at };
}
