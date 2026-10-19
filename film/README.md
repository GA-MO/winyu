# Booth films

Looping films for the Winyu booth. Each film is one self-contained HTML page that draws every frame as a pure function of time, so the browser preview and the rendered MP4 match frame for frame.

| File | Cut |
|---|---|
| `demo.html` | The product demo: the real app screens, seven headlines from "ทุกระบบ ในคำถามเดียว" to "เชื่อมระบบใหม่ ใช้ได้ทันที" |
| `isometric.html` | The same story in a miniature isometric city, with screens shown flat when they must be read |

## View

Open a film in a browser. It plays with a scrub bar at the bottom, and the speaker button turns the booth sound on (browsers block sound until a click). `?t=12.5` opens it paused at that time, silent. `demo.html?music=bounce` plays the demo with another music preset (`pop`, the default, or `bounce`). Pages load fonts from Google Fonts and GSAP from cdnjs, so they need a network connection.

## Render

```bash
cd film && bun install
bun run render demo.html out/demo.mp4             # needs Google Chrome
FILM_QUERY=music=bounce bun run render demo.html out/demo-b.mp4   # extra query for the film, here another music preset
bun run shots isometric.html 4.5,10,22.3 out/shots  # a PNG at each time
bun run check-audio out/demo.mp4 13.15,21.35         # tracks, loudness, the loop seam, and the audio onset near each time
```

`render.ts` serves this folder, opens the film in headless Chrome with `?capture`, calls `window.film.render(t)` at 30 fps and encodes H.264 with mediabunny. A film with a score also gets an AAC track (48 kHz stereo), with an edit list that skips the encoder's priming so sound stays on its frames and the loop has no gap. Output goes to `out/`, which git ignores. `BOOTH_RENDER_PORT`, `BOOTH_SHOTS_PORT` and `BOOTH_DEBUG_PORT` override the ports.

## Data

`facts.json` holds every number the films show. It is committed, so the films open and render without the app. To rebuild it from the app's own data (`runMetric`, alerts, the HR leave port, the asset register and the people directory), run at the repository root:

```bash
bun run booth:facts
```

## Rules for every film

- Music and SFX, no voice. The booth is loud, so the film must read fully with the sound off; sound only adds to it.
- The last moment hands back to the first, in picture and in sound, so the loop has no seam.
- Every sound cue takes its time from the film's own timeline constants, the same ones the frames use. If a moment a cue needs is a literal inside a draw function, lift it into a named constant first.
- 1920×1080 at 30 fps.
- Every number on screen comes from `facts.json`. Never type a figure into a film.
- `render(t)` depends on `t` only, with no timers, CSS transitions or state carried between frames.
- The film is self-contained: no imports from the app, and no files outside this folder.

## Film contract

```js
window.film = { length, render(t), ready, audio() };
```

`render.ts` waits for `ready`, then calls `render(t)` for every frame and muxes the buffer `audio()` resolves to. With `?capture` a film hides its player, draws at 1:1 and plays no sound.

## Sound

A film declares a score next to its timeline and hands it to `sound.js`:

```js
const SOUND = {
  music: 'suite',                                      // a preset in sound.js
  tempo: {beat: BEAT, on: W3.r(MOMENT.memc)},
  sections: [{at: 0, mix: 'open'}, {at: W3.S, mix: 'flow'}, ...],
  cues: [{at: W3.r(MOMENT.memc), sfx: 'memory'}, ...],
};
window.film.audio = () => Sound.renderScore(SOUND, LENGTH);
```

`Sound.renderScore` renders it with `OfflineAudioContext` as a pure function of the timeline, so the preview and the MP4 carry the same buffer. Everything is synthesized: oscillators, filtered noise and a generated room, with no audio files. `Sound.speaker(film)` plays that buffer in the film's own player.

- `tempo` picks the beat nearest the preset's `bpm` (or `tempo.beat`) that fits a whole number of 4/4 bars into the film, phased so `on` falls on a beat. Both films put the memory motif on the beat.
- `sections` set which layers of the preset play from each time on (`mix` is a key of the preset's `mixes`; an unknown mix throws). A section also restarts the preset's chord progression for that mix at its first bar.
- Each `sfx` is a key in the `SFX` registry or in the preset's own `sfx`, which wins; `step` picks the note or variant. SFX are tuned to the preset's key and dip the music while they sound. `memory` is the motif for "จำไว้แล้ว"; it plays again when the film shows that Winyu remembered. `hit` is a riser into an impact, one per headline.
- The render folds its tail back onto the start, so reverb and cue tails cross the loop seam. It then compresses, normalizes to −16 LUFS and limits peaks to −1.5 dBFS on the loop itself. There is no sub-bass (high-pass at 90 Hz) for small speakers in a crowded hall. A preset's `top` sets how much it keeps above 6 kHz: `suite` rolls it off, `pop` and `bounce` keep it.

| Preset | Film | Feel |
|---|---|---|
| `suite` | `isometric.html` | Calm: E♭ major, 79 BPM, piano and pads |
| `pop` | `demo.html` (default) | Tech-pop: A major, 119 BPM, four-on-the-floor kick, claps, pumping saw chords, square arpeggio, lead hook |
| `bounce` | `demo.html?music=bounce` | Playful: F major, 109 BPM, swung, finger snaps, tambourine, slap bass, muted-guitar chanks, glockenspiel hook |
