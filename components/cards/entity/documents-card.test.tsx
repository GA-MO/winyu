import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readRecordings, turnOf } from "@/lib/eval/recording";
import { TH } from "@/lib/i18n/th";
import type { z } from "zod";
import { DocumentsCard } from "./documents";
import { documentsResult } from "./shapes";

const COPY = TH.documents;
const RECORDINGS = readRecordings();

type Recorded = { result: z.infer<typeof documentsResult>; words: string };

let root: Root | null = null;
let host: HTMLElement | null = null;

function recorded(caseId: string): Recorded {
  const recording = RECORDINGS.get(caseId);
  if (!recording) throw new Error(`no recording ${caseId}`);
  const turn = turnOf(recording);
  const call = turn.calls.find((step) => step.tool === "search_documents");
  if (!call) throw new Error(`no search_documents in ${caseId}`);
  return { result: documentsResult.parse(call.result), words: turn.words };
}

async function draw(result: unknown, text: string, streaming = false): Promise<HTMLElement> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<DocumentsCard result={result} reply={{ text, streaming }} />));
  return host;
}

function openSections(card: HTMLElement): string[] {
  return [...card.querySelectorAll("details[open] > summary")].map((summary) => summary.textContent ?? "");
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("DocumentsCard", () => {
  test("a reply that cites no passage folds the search behind one not-found line", async () => {
    for (const caseId of ["docs-hr-hidden", "docs-unanswerable"]) {
      const { result, words } = recorded(caseId);
      const card = await draw(result, words);
      expect(card.textContent).toContain(COPY.notFound);
      expect(card.textContent).toContain(COPY.searched(result.data.passages.length));
      expect(card.textContent).not.toContain(COPY.cardTitle);
      expect(openSections(card)).toEqual([]);
      act(() => root?.unmount());
      host?.remove();
    }
  });

  test("a reply that cites one passage shows it open first and folds the rest", async () => {
    const { result, words } = recorded("docs-credit-terms");
    const card = await draw(result, words);
    expect(card.textContent).toContain(COPY.cited(1));
    expect(card.textContent).toContain(COPY.otherPassages(result.data.passages.length - 1));
    expect(card.textContent).not.toContain(COPY.notFound);
    const open = openSections(card);
    expect(open).toHaveLength(1);
    expect(open[0]).toContain("ระยะเวลาเครดิตตามระดับ");
  });

  test("a reply that cites every passage lists them all with nothing folded", async () => {
    const { result } = recorded("docs-credit-terms");
    const sections = result.data.passages.map((passage) => passage.section).join(" และ ");
    const card = await draw(result, `ตาม ${sections}`);
    expect(card.textContent).toContain(COPY.cited(result.data.passages.length));
    expect(card.textContent).not.toContain(COPY.otherPassages(0));
    expect(card.querySelectorAll("details").length).toBe(result.data.passages.length);
  });

  test("while the reply streams and cites nothing yet, the card does not claim not found", async () => {
    const { result } = recorded("docs-credit-terms");
    const card = await draw(result, "", true);
    expect(card.textContent).toContain(COPY.searching);
    expect(card.textContent).not.toContain(COPY.notFound);
  });
});
