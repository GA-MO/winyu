# Booth films

Two looping films tell the Winyu story in the same nine headlines, from "หลายระบบ เหลือคำถามเดียว" to "เชื่อมระบบใหม่ ได้ทันที", and end on the Winyu tile "ผู้ช่วย AI ของทุกคนในองค์กร". Each page draws every frame as a pure function of time, so the browser preview and the rendered MP4 match frame for frame.

| File | Style | Length |
|---|---|---|
| `isometric.html` | A miniature isometric city, with screens shown flat over it when they must be read | 75.2 s |
| `hybrid.html` | ผสม: the city carries the big picture, and the camera pushes into a real Winyu screen lying in the city when there is something to read, then pulls back out | 78.2 s |

## View

```bash
cd film && bun run preview    # serves this folder and prints the film URLs
```

Each film plays with a scrub bar at the bottom, and the speaker button turns the booth sound on (browsers block sound until a click). `?t=12.5` opens it at that time. Both films read `facts.json` when they load, so open them through `bun run preview` (or any local server), not as files. The pages load fonts from Google Fonts and GSAP from cdnjs, so they need a network connection.

## Render

```bash
cd film && bun install
bun run render isometric.html out/isometric.mp4    # needs Google Chrome
bun run render hybrid.html out/hybrid.mp4
bun run shots hybrid.html 4.5,10,22.3 out/shots  # a PNG at each time
bun run check-audio out/isometric.mp4 14.25,15.85,23,63.4,69.4 16:18   # tracks, loudness, the loop seam, the audio onset near each time, and the RMS of each span
bun run continuity hybrid.html out/continuity out/hybrid.mp4   # momentary loudness of the mix and the music alone, every drop and hole, and a chart
```

`continuity.ts` is the check for a score that stops and starts. It computes BS.1770 momentary loudness (400 ms blocks, 50 ms hop) of the MP4's mix and of the music rendered alone, lists every drop of more than 6 dB within 250 ms and every 10 ms hole 15 dB below the second before it, reports the median loudness swing inside a bar, and draws the curve with section joins, cues, bar lines and the 4 s render windows to a PNG. Without an MP4 it reads the film's own rendered score, which is quick enough to run after every change to the score.

`render.ts` serves this folder, opens the film in headless Chrome with `?capture`, calls `window.film.render(t)` at 30 fps and encodes H.264 with mediabunny. The score becomes an AAC track (48 kHz stereo). The encoder gets the loop with its own end before it and its own start after it, and an edit list skips that lead and the encoder priming, so sound stays on its frames and the loop has no step. Output goes to `out/`, which git ignores. `BOOTH_PREVIEW_PORT`, `BOOTH_RENDER_PORT`, `BOOTH_SHOTS_PORT` and `BOOTH_DEBUG_PORT` override the ports.

## Data

`facts.json` holds every number the films show. `hybrid.html` builds its screens from it when it loads. It is committed, so the film opens and renders without the app. To rebuild it from the app's own data (`runMetric`, the HR leave port, the asset register and the people directory), run at the repository root:

```bash
bun run booth:facts
```

The app's data date moves, so a rebuild can change the numbers. Check the stills before you use a rebuilt file.

## Rules

- One headline per beat, in Thai, readable from 3 m: 80 px or larger at 1080p.
- A screen keeps the app's own type scale: the hybrid draws the real components' sizes (12 px eyebrow, 19 px verdict, 30 px hero, 13 to 14 px rows) and makes them readable only by pushing in on the whole screen, by the same factor every time. Fewer elements, not bigger letters. Town labels share one size (40 px).
- One idea per push-in, and a different card each beat; the regional sales card does not come back.
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

`hybrid.html` keeps three real screens: the Winyu web app window, the sales rep's phone, and a three-window view of the CEO, the sales rep and IT. Each `VISITS` entry lays one of them on a plinth in the city for a while, with one or more `moves`, each a push and a pull time span. Every push and pull lasts two beats and starts on a beat, so its whoosh lands on the grid.

- A screen lying in the city is the same DOM element as the flat screen, under `rotateX(54.7356deg) rotateZ(45deg)`, which is exactly the city's isometric projection, scaled so the element spans its width in world units. It shows its live content in miniature.
- During a push, the screen's scale grows in log space from its size in the city to `ZOOM` (2.75), centred on the screen's content, and the two angles unroll to zero. The phone lands whole, at 1.34, with the same margin above and below it. The city's camera follows the screen only up to 1.8x, then it blurs and fades, so it never blows up into giant blocks. A pull runs the same path backwards into the next scene's camera.
- A visit with `town` keeps the city in frame: the phone beat pins the city low on the left so the sales rep and the HR building stay beside the phone.
- Inside the window, the content changes by layer (`L1` to `L8`). A swap scrolls the chat: the old exchange leaves upward under a soft edge below the headline while the new one comes up from below, a full layer apart, so two layouts never overlap and the screen is never empty. Each layer's content starts arriving during its push, so a push never lands on an empty screen.
- The connect beat ends on its payoff: the register connects, the ask box takes a question only the new system can answer, and the answer card names the register as its source.

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

`hybrid.html` uses the same preset and SFX kit with its own score, built from its own `T` timeline: a riser and hit on every headline, the memory motif on "จำไว้แล้ว" and again when the remembered chip lights up, a half-time break under the phone typing, a build into "เห็นเท่าที่สิทธิ์ให้", the peak arriving with "เชื่อมระบบใหม่", the tonic and a sting on the end tile, a turnaround back into bar 1, and a `whoosh` on every push into a screen (`step: 0`, rising) and every pull back out (`step: 1`, falling).

- `tempo.on` is a downbeat. The tempo is the one nearest 108 BPM that fits a whole number of 4/4 bars into the film. `Sound.grid(score, length)` gives the films the same grid, with `snap(t, per)` to put a headline, a whoosh or a move on the nearest 1/per of a beat.
- `sections` set which layers play from each time on. `mix` is one of `intro`, `drive`, `hold`, `full`, `break`, `build`, `peak`, `end` and `turn`; an unknown mix throws. A section starts on the bar line nearest its `at`, and its layers cross over the last beat before that line, under a fill of snaps and toms rising into it. One groove never stops: every mix keeps a pad bed, a shaker and bass. `hold` thins the groove under the memory motif, `break` is half time, a `build` lands on the dominant at its last bar, `end` is the tonic bar under the end tile and `turn` is the last bar, a ii–V whose fill runs over its last two beats into bar 1 so the loop starts the song again. `Sound.sections(film.score, film.length)` lists each section with its bar line.
- Each `sfx` is a key in the `SFX` registry of `sound.js`, and `step` picks the note or variant. SFX are tuned to the key and dip the music by at most 2 dB while they sound. `memory` plays again when the film shows that Winyu remembered. Its first note sounds on its cue and the others fall on the next eighths of the beat grid, so a cue between beats still sits in the groove. `hit` is a two-beat riser into an impact on each headline, which lands on an eighth of the grid. `step: 1` is the smaller hit. The end tile carries only the sting.

`Sound.renderScore` renders the score with `OfflineAudioContext` as a pure function of the timeline, so the preview and the MP4 carry the same buffer. It renders in 4-second windows. Each window builds only the voices that start in it, with 4 seconds of tail, and the windows render in parallel and sum. The mix is linear, so the sum equals one long render up to float rounding of start frames, at a fraction of the cost: about 2 s instead of about 90 s in headless Chrome.

The render then folds its tail back onto the start, so reverb and cue tails cross the loop seam. It compresses, normalizes to −16 LUFS and limits peaks to −1.5 dBFS on the loop itself. The glue compressor holds the peaks, so the limiter takes off a fraction of a dB. A high-pass at 90 Hz removes sub-bass for small speakers in a crowded hall, and a −5 dB shelf at 6 kHz keeps the top bright but not harsh. `Sound.speaker(film)` plays the buffer in the film's own player.
