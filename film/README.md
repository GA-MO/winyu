# Booth film

The looping film for the Winyu booth is `isometric.html`. It tells the Winyu story in a miniature isometric city, with screens shown flat when they must be read, in nine headlines from "หลายระบบ เหลือคำถามเดียว" to "เชื่อมระบบใหม่ ได้ทันที". The page draws every frame as a pure function of time, so the browser preview and the rendered MP4 match frame for frame.

## View

Open `isometric.html` in a browser. It plays with a scrub bar at the bottom, and the speaker button turns the booth sound on (browsers block sound until a click). `?t=12.5` opens it paused at that time, silent. The page loads fonts from Google Fonts and GSAP from cdnjs, so it needs a network connection.

## Render

```bash
cd film && bun install
bun run render isometric.html out/isometric.mp4    # needs Google Chrome
bun run shots isometric.html 4.5,10,22.3 out/shots  # a PNG at each time
bun run check-audio out/isometric.mp4 14.25,15.85,23,63.4,69.4   # tracks, loudness, the loop seam, and the audio onset near each time
```

`render.ts` serves this folder, opens the film in headless Chrome with `?capture`, calls `window.film.render(t)` at 30 fps and encodes H.264 with mediabunny. The score becomes an AAC track (48 kHz stereo). The encoder gets the loop with its own end before it and its own start after it, and an edit list skips that lead and the encoder priming, so sound stays on its frames and the loop has no step. Output goes to `out/`, which git ignores. `BOOTH_RENDER_PORT`, `BOOTH_SHOTS_PORT` and `BOOTH_DEBUG_PORT` override the ports.

## Data

`facts.json` holds every number the film shows. It is committed, so the film opens and renders without the app. To rebuild it from the app's own data (`runMetric`, the HR leave port, the asset register and the people directory), run at the repository root:

```bash
bun run booth:facts
```

The app's data date moves, so a rebuild can change the numbers. Check the stills before you use a rebuilt file.

## Rules

- Music and SFX, no voice. The booth is loud, so the film must read fully with the sound off; sound only adds to it.
- The last moment hands back to the first, in picture and in sound, so the loop has no seam.
- Every sound cue takes its time from the film's own timeline constants, the same ones the frames use. If a moment a cue needs is a literal inside a draw function, lift it into a named constant first.
- 1920×1080 at 30 fps, and a length that is a whole number of frames.
- Every number on screen comes from `facts.json`. Never type a figure into the film.
- `render(t)` depends on `t` only, with no timers, CSS transitions or state carried between frames.
- The film is self-contained: no imports from the app, and no files outside this folder.

## Film contract

```js
window.film = { length, render(t), ready, audio(), score };
```

`render.ts` waits for `ready`, then calls `render(t)` for every frame and muxes the buffer `audio()` resolves to. With `?capture` the film hides its player, draws at 1:1 and plays no sound.

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

- `tempo.on` phases the beat so that time falls on a beat. The tempo is the one nearest 108 BPM that fits a whole number of 4/4 bars into the film. The film puts the memory motif ("จำไว้แล้ว") on a downbeat.
- `sections` set which layers play from each time on. `mix` is one of `intro`, `drive`, `hold`, `full`, `break`, `build`, `peak` and `end`; an unknown mix throws. A layer a section adds joins on the first beat at or after the section starts, so a section that starts with a headline hit arrives with it; the melody plays the end of its phrase as a pickup until the next bar line. A section restarts its own chord progression at its first full bar. `hold` drops the drums under the memory motif and keeps a soft pad and electric piano, `break` is half time with electric piano, and a `build` lands on the dominant at its last bar. `Sound.sections(film.score, film.length)` lists each section with the time its layers join.
- Each `sfx` is a key in the `SFX` registry of `sound.js`, and `step` picks the note or variant. SFX are tuned to the key and dip the music while they sound. `memory` plays again when the film shows that Winyu remembered. Its first note sounds on its cue and the others fall on the next eighths of the beat grid, so a cue between beats still sits in the groove. `hit` is a two-beat riser into an impact: one per headline, one when the first headline returns at the loop, and one on the logo. `step: 1` is the smaller hit.

`Sound.renderScore` renders the score with `OfflineAudioContext` as a pure function of the timeline, so the preview and the MP4 carry the same buffer. It renders in 4-second windows. Each window builds only the voices that start in it, with 4 seconds of tail, and the windows render in parallel and sum. The mix is linear, so the sum equals one long render up to float rounding of start frames, at a fraction of the cost: about 2 s instead of about 90 s in headless Chrome.

The render then folds its tail back onto the start, so reverb and cue tails cross the loop seam. It compresses, normalizes to −16 LUFS and limits peaks to −1.5 dBFS on the loop itself. The glue compressor holds the peaks, so the limiter takes off a fraction of a dB. A high-pass at 90 Hz removes sub-bass for small speakers in a crowded hall, and a −5 dB shelf at 6 kHz keeps the top bright but not harsh. `Sound.speaker(film)` plays the buffer in the film's own player.
