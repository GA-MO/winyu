# Booth films

Two looping films tell the Winyu story in the same nine headlines, from "หลายระบบ เหลือคำถามเดียว" to "เชื่อมระบบใหม่ ได้ทันที", and end on the Winyu tile "ผู้ช่วย AI ของทุกคนในองค์กร". Each page draws every frame as a pure function of time, so the browser preview and the rendered MP4 match frame for frame.

| File | Style | Length |
|---|---|---|
| `isometric.html` | A miniature isometric city, with screens shown flat over it when they must be read | 73.6 s |
| `hybrid.html` | ผสม: the city carries the big picture, and the camera pushes into a real Winyu screen lying in the city when there is something to read, then pulls back out | 71.8 s |

## View

```bash
cd film && bun run preview    # serves this folder and prints the film URLs
```

Each film plays with a scrub bar at the bottom, and the speaker button turns the booth sound on (browsers block sound until a click). `?t=12.5` opens it at that time. `hybrid.html` reads `facts.json` when it loads, so open it through `bun run preview` (or any local server), not as a file. `isometric.html` also opens as a file. The pages load fonts from Google Fonts and GSAP from cdnjs, so they need a network connection.

## Render

```bash
cd film && bun install
bun run render isometric.html out/isometric.mp4    # needs Google Chrome
bun run render hybrid.html out/hybrid.mp4
bun run shots hybrid.html 4.5,10,22.3 out/shots  # a PNG at each time
bun run check-audio out/isometric.mp4 14.25,15.85,23,63.4,69.4 16:18   # tracks, loudness, the loop seam, the audio onset near each time, and the RMS of each span
```

`render.ts` serves this folder, opens the film in headless Chrome with `?capture`, calls `window.film.render(t)` at 30 fps and encodes H.264 with mediabunny. The score becomes an AAC track (48 kHz stereo). The encoder gets the loop with its own end before it and its own start after it, and an edit list skips that lead and the encoder priming, so sound stays on its frames and the loop has no step. Output goes to `out/`, which git ignores. `BOOTH_PREVIEW_PORT`, `BOOTH_RENDER_PORT`, `BOOTH_SHOTS_PORT` and `BOOTH_DEBUG_PORT` override the ports.

## Data

`facts.json` holds every number the films show. `hybrid.html` builds its screens from it when it loads. It is committed, so the film opens and renders without the app. To rebuild it from the app's own data (`runMetric`, the HR leave port, the asset register and the people directory), run at the repository root:

```bash
bun run booth:facts
```

The app's data date moves, so a rebuild can change the numbers. Check the stills before you use a rebuilt file.

## Rules

- One headline per beat, in Thai, readable from 3 m: 80 px or larger at 1080p.
- Music and SFX, no voice. The booth is loud, so the film must read fully with the sound off; sound only adds to it.
- The last moment hands back to the first, in picture and in sound, so the loop has no seam.
- Every sound cue takes its time from the film's own timeline constants, the same ones the frames use. If a moment a cue needs is a literal inside a draw function, lift it into a named constant first.
- 1920×1080 at 30 fps, and a length that is a whole number of frames.
- Every number on screen comes from `facts.json`. Never type a figure into the film.
- `render(t)` depends on `t` only, with no timers, CSS transitions or state carried between frames.
- A film is self-contained: no imports from the app, and no files outside this folder. Films share only `sound.js`, `facts.json` and the render pipeline; a film copies any drawing code it takes from another.
- A push into a screen holds at least 2.5 s on the readable screen before anything pulls out.

## Film contract

```js
window.film = { length, render(t), ready, audio(), score };
```

`render.ts` waits for `ready`, then calls `render(t)` for every frame and muxes the buffer `audio()` resolves to. With `?capture` the film hides its player, draws at 1:1 and plays no sound.

## Hybrid push-in

`hybrid.html` keeps three real screens: the Winyu web app window, the sales rep's phone, and a three-window view of the CEO, the sales rep and IT. Each `VISITS` entry lays one of them on a plinth in the city for a while, with a `push` and a `pull` time span.

- A screen lying in the city is the same DOM element as the flat screen, under `rotateX(54.7356deg) rotateZ(45deg)`, which is exactly the city's isometric projection, scaled so the element spans its width in world units. It shows its live content in miniature.
- During a push, the screen's scale grows in log space from its size in the city to its flat size, the two angles unroll to zero, and the city's camera zooms by the same ratio, pinned on the screen. The city fades out while the screen fills the frame, and its labels fade as soon as the camera moves. A pull runs the same path backwards into the next scene's camera.
- Inside the window, the content changes by layer (`L1` to `L6`): the old layer fades out before the new one fades in, so two layouts never overlap.

## Sound

The film declares its score next to its timeline and hands it to `sound.js`:

```js
const SOUND = {
  tempo: {on: W3.r(MOMENT.memc)},
  sections: [{at: 0, mix: 'intro'}, {at: W2.r(MOMENT.sun), mix: 'drive'}, ...],
  cues: [{at: W3.r(MOMENT.memc), sfx: 'memory'}, ...],
};
window.film.audio = () => Sound.renderScore(SOUND, LENGTH);
```

The score is lively and playful, for a miniature town: F major, swung, about 108 BPM, with finger snaps, tambourine, slap bass, muted-guitar chops, electric piano, a toy glockenspiel hook and bubble pops. Everything is synthesized (oscillators, filtered noise and a generated room), with no audio files.

`hybrid.html` uses the same preset and SFX kit with its own score, built from its own `T` timeline: a riser and hit on every headline, the memory motif alone on "จำไว้แล้ว" and again on the recall chip, a half-time break under the phone typing, a build into "เห็นเท่าที่สิทธิ์ให้", the peak arriving with "เชื่อมระบบใหม่", a sting on the end tile, and a `whoosh` on every push into a screen (`step: 0`, rising) and every pull back out (`step: 1`, falling).

- `tempo.on` phases the beat so that time falls on a beat. The tempo is the one nearest 108 BPM that fits a whole number of 4/4 bars into the film. The film puts the memory motif ("จำไว้แล้ว") on a downbeat.
- `sections` set which layers play from each time on. `mix` is one of `intro`, `drive`, `hold`, `full`, `break`, `build`, `peak` and `end`; an unknown mix throws. A layer a section adds joins on the first beat at or after the section starts, so a section that starts with a headline hit arrives with it; the melody plays the end of its phrase as a pickup until the next bar line. A section restarts its own chord progression at its first full bar. `hold` drops the drums under the memory motif and keeps a soft pad and electric piano, `break` is half time with electric piano, and a `build` lands on the dominant at its last bar. `Sound.sections(film.score, film.length)` lists each section with the time its layers join.
- Each `sfx` is a key in the `SFX` registry of `sound.js`, and `step` picks the note or variant. SFX are tuned to the key and dip the music while they sound. `memory` plays again when the film shows that Winyu remembered. Its first note sounds on its cue and the others fall on the next eighths of the beat grid, so a cue between beats still sits in the groove. `hit` is a two-beat riser into an impact: one per headline, one when the first headline returns at the loop, and one on the logo. `step: 1` is the smaller hit.

`Sound.renderScore` renders the score with `OfflineAudioContext` as a pure function of the timeline, so the preview and the MP4 carry the same buffer. It renders in 4-second windows. Each window builds only the voices that start in it, with 4 seconds of tail, and the windows render in parallel and sum. The mix is linear, so the sum equals one long render up to float rounding of start frames, at a fraction of the cost: about 2 s instead of about 90 s in headless Chrome.

The render then folds its tail back onto the start, so reverb and cue tails cross the loop seam. It compresses, normalizes to −16 LUFS and limits peaks to −1.5 dBFS on the loop itself. The glue compressor holds the peaks, so the limiter takes off a fraction of a dB. A high-pass at 90 Hz removes sub-bass for small speakers in a crowded hall, and a −5 dB shelf at 6 kHz keeps the top bright but not harsh. `Sound.speaker(film)` plays the buffer in the film's own player.
