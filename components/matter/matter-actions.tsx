"use client";

import { useState } from "react";
import { Forward } from "lucide-react";
import { MoreMenu, Primary, Quiet, type MenuItem } from "@/components/inbox/row";
import { PeoplePicker, useShareContacts } from "@/components/share/share-sheet";
import { TH } from "@/lib/i18n/th";
import { MATTER_ASK_MAX } from "@/lib/share/card";
import type { MatterActionKind, MatterBrief } from "@/lib/share/matter-actions";

const MATTERS_ENDPOINT = "/api/matters/";
const FIELD = "min-h-9 w-full rounded-full border border-border bg-card px-3.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";
const SHOWN: readonly MatterActionKind[] = ["accept", "reply", "ask", "pass_on"];
const FOLDED: readonly MatterActionKind[] = ["not_mine", "done"];
const COPY = TH.matter;

type Writing = "ask" | "reply";
type Mode = { kind: "idle" } | { kind: "writing"; action: Writing; text: string } | { kind: "passing"; to: string | null };
type Press = { kind: "accept" | "not_mine" | "done" } | { kind: Writing; text: string } | { kind: "pass_on"; toUserId: string };

async function sendPress(code: string, press: Press): Promise<string | null> {
  const response = await fetch(`${MATTERS_ENDPOINT}${encodeURIComponent(code)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(press) }).catch(() => null);
  if (response?.ok) return null;
  const body = (await response?.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? COPY.failed;
}

function PassOn({ suggestedId, chosen, choose }: { suggestedId: string | null; chosen: string | null; choose: (id: string) => void }) {
  const contacts = useShareContacts();
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card">
      <p className="px-4 pt-2.5 text-xs font-medium text-muted-foreground">{COPY.passPick}</p>
      <div className="ui-scrollbar max-h-64 overflow-y-auto">
        {contacts ? <PeoplePicker contacts={contacts} suggestedId={suggestedId} chosen={chosen ? [chosen] : []} onToggle={(contact) => choose(contact.id)} /> : <div className="h-16" aria-busy />}
      </div>
    </div>
  );
}

/** What the viewer may press on a matter, from the transition table: the main presses as buttons, ไม่ใช่ของผม and เสร็จ folded under "…"; asking and passing on open in place, so it works inside the bell's sheet at phone width. */
export function MatterActions({ brief, onActed }: { brief: Pick<MatterBrief, "code" | "actions" | "suggestedId">; onActed: () => void }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const allowed = new Set(brief.actions);

  if (allowed.size === 0) return null;

  const run = async (press: Press) => {
    setBusy(true);
    setProblem(null);
    const failure = await sendPress(brief.code, press);
    setBusy(false);
    if (failure) return setProblem(failure);
    setMode({ kind: "idle" });
    onActed();
  };

  const start = (kind: MatterActionKind) => {
    if (kind === "ask" || kind === "reply") return setMode({ kind: "writing", action: kind, text: "" });
    if (kind === "pass_on") return setMode({ kind: "passing", to: null });
    if (kind === "accept" || kind === "not_mine" || kind === "done") void run({ kind });
  };

  const shown = SHOWN.filter((kind) => allowed.has(kind));
  const folded = FOLDED.filter((kind) => allowed.has(kind));
  const inline = shown.length === 0 ? folded : [];
  const menu: MenuItem[] = shown.length === 0 ? [] : folded.map((kind) => ({ label: COPY.actions[kind], onSelect: () => start(kind) }));
  const passTo = mode.kind === "passing" ? (mode.to ?? brief.suggestedId) : null;

  return (
    <div className="flex flex-col gap-2" data-matter-actions={brief.code}>
      {mode.kind === "idle" ? (
        <div className="flex flex-wrap items-center gap-1">
          {[...shown, ...inline].map((kind, index) =>
            index === 0 ? (
              <Primary key={kind} onClick={() => start(kind)} disabled={busy}>
                {COPY.actions[kind]}
              </Primary>
            ) : (
              <Quiet key={kind} onClick={() => start(kind)} disabled={busy} className="border border-border">
                {COPY.actions[kind]}
              </Quiet>
            ),
          )}
          <span className="flex-1" />
          <MoreMenu items={menu} />
        </div>
      ) : null}
      {mode.kind === "writing" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode.text.trim()) void run({ kind: mode.action, text: mode.text.trim() });
          }}
        >
          <input
            autoFocus
            value={mode.text}
            onChange={(event) => setMode({ ...mode, text: event.target.value.slice(0, MATTER_ASK_MAX) })}
            placeholder={mode.action === "ask" ? COPY.askPlaceholder : COPY.replyPlaceholder}
            aria-label={COPY.actions[mode.action]}
            className={FIELD}
          />
          <div className="flex items-center gap-1">
            <button type="submit" disabled={busy || !mode.text.trim()} className="inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-ink-foreground transition hover:opacity-90 disabled:opacity-50">
              {COPY.send}
            </button>
            <Quiet onClick={() => setMode({ kind: "idle" })}>{COPY.cancel}</Quiet>
          </div>
        </form>
      ) : null}
      {mode.kind === "passing" ? (
        <>
          <PassOn suggestedId={brief.suggestedId} chosen={passTo} choose={(to) => setMode({ kind: "passing", to })} />
          <div className="flex items-center gap-1">
            <Primary onClick={() => passTo && void run({ kind: "pass_on", toUserId: passTo })} disabled={busy || !passTo}>
              <Forward className="size-3.5" aria-hidden />
              {COPY.actions.pass_on}
            </Primary>
            <Quiet onClick={() => setMode({ kind: "idle" })}>{COPY.cancel}</Quiet>
          </div>
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
