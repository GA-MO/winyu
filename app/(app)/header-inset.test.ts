import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(import.meta.dir);
const LAYOUT = path.join(APP_DIR, "layout.tsx");
const CHROME = path.join(APP_DIR, "../../components/chrome/app-chrome.tsx");
const LANDING = path.join(APP_DIR, "../../components/landing/landing.tsx");
const VIEWPORT_HEIGHT = /\b(min-)?h-(dvh|screen)\b/;
const INSET = "--winyu-header-inset";

function surfaces(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return surfaces(full);
    return /^(page|layout|loading)\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe("the phone header inset", () => {
  test("the app's main content starts under the header bar", () => {
    expect(readFileSync(LAYOUT, "utf8")).toMatch(/<main className="[^"]*pt-\(--winyu-header-inset\)/);
  });

  test("the bell and avatar sit on a bar as tall as the inset, so content scrolls under the bar and not under the buttons", () => {
    const chrome = readFileSync(CHROME, "utf8");
    expect(chrome).toMatch(/data-header-bar className="fixed inset-x-0 top-0 [^"]*h-\(--winyu-header-inset\)/);
  });

  test("no page under the app layout sizes itself to the whole viewport, which would push it past the inset", () => {
    const offenders = [...surfaces(APP_DIR).filter((file) => file !== LAYOUT), LANDING].filter((file) => VIEWPORT_HEIGHT.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => path.relative(APP_DIR, file))).toEqual([]);
    expect(readFileSync(path.join(APP_DIR, "../globals.css"), "utf8")).toContain(`calc(100dvh - var(${INSET}, 0px))`);
  });
});
