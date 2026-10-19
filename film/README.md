# Booth films

Looping films for the Winyu booth. Each film is one self-contained HTML page that draws every frame as a pure function of time, so the browser preview and the rendered MP4 match frame for frame.

| File | Cut |
|---|---|
| `demo.html` | The product demo: the real app screens, seven headlines from "ทุกระบบ ในคำถามเดียว" to "เชื่อมระบบใหม่ ใช้ได้ทันที" |
| `isometric.html` | The same story in a miniature isometric city, with screens shown flat when they must be read |

## View

Open a film in a browser. It plays with a scrub bar at the bottom. `?t=12.5` opens it paused at that time. Pages load fonts from Google Fonts and GSAP from cdnjs, so they need a network connection.

## Render

```bash
cd film && bun install
bun run render demo.html out/demo.mp4             # needs Google Chrome
bun run shots isometric.html 4.5,10,22.3 out/shots  # a PNG at each time
```

`render.ts` serves this folder, opens the film in headless Chrome with `?capture`, calls `window.film.render(t)` at 30 fps and encodes H.264 with mediabunny. Output goes to `out/`, which git ignores. `BOOTH_RENDER_PORT`, `BOOTH_SHOTS_PORT` and `BOOTH_DEBUG_PORT` override the ports.

## Data

`facts.json` holds every number the films show. It is committed, so the films open and render without the app. To rebuild it from the app's own data (`runMetric`, alerts, the HR leave port, the asset register and the people directory), run at the repository root:

```bash
bun run booth:facts
```

## Rules for every film

- The last moment hands back to the first, so the loop has no seam.
- 1920×1080 at 30 fps.
- Every number on screen comes from `facts.json`. Never type a figure into a film.
- `render(t)` depends on `t` only, with no timers, CSS transitions or state carried between frames.
- The film is self-contained: no imports from the app, and no files outside this folder.

## Film contract

```js
window.film = { length, render(t), ready };
```

`render.ts` waits for `ready`, then calls `render(t)` for every frame. With `?capture` a film hides its player and draws at 1:1.
