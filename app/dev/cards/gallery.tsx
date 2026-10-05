"use client";

import { useState } from "react";
import { CardActionsProvider, type CardAction } from "@/components/cards/card-actions";
import { actionRequest } from "@/components/cards/action-tool";
import { renderApproval } from "@/components/cards/approval-card";
import { TOOL_CARDS, type CardToolName } from "@/components/cards/registry";
import type { SampleResult } from "./run-samples";
import type { WriteSample } from "./samples";

function isCardTool(tool: string): tool is CardToolName {
  return tool in TOOL_CARDS;
}

function Caption({ tool, detail }: { tool: string; detail: string }) {
  return (
    <p className="flex items-baseline justify-between gap-2 px-1 text-[11px] text-muted-foreground">
      <code className="font-mono">{tool}</code>
      <span className="truncate">{detail}</span>
    </p>
  );
}

function ApprovalSample({ sample }: { sample: WriteSample }) {
  const [approved, setApproved] = useState<boolean | null>(null);
  return renderApproval({ tool: sample.tool, input: sample.input, approved, approve: () => setApproved(true), reject: () => setApproved(false) });
}

/** Every card kind drawn from this user's real tool results, then one approval per write tool; pressed buttons are listed, not run. */
export function Gallery({ reads, writes }: { reads: SampleResult[]; writes: WriteSample[] }) {
  const [pressed, setPressed] = useState<string[]>([]);
  const runAction = (action: CardAction) => {
    const request = actionRequest(action);
    setPressed((current) => [request ? (request.kind === "ask" ? request.prompt : `${request.tool} ${JSON.stringify(request.input)}`) : action.label, ...current].slice(0, 5));
  };
  return (
    <CardActionsProvider value={{ runAction }}>
      {pressed.length > 0 ? (
        <ol className="fixed bottom-4 left-4 z-40 max-w-sm rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground shadow-lift">
          {pressed.map((line, index) => (
            <li key={`${index}-${line}`} className="truncate">
              {line}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {reads.map((sample, index) => (
          <figure key={`${sample.tool}-${index}`} className="mb-4 flex break-inside-avoid flex-col gap-1.5" data-tool={sample.tool}>
            <Caption tool={sample.caption} detail={sample.question} />
            {isCardTool(sample.tool) ? TOOL_CARDS[sample.tool](sample.result, sample.input, { text: sample.reply ?? "", streaming: sample.reply === undefined }) : null}
          </figure>
        ))}
      </div>
      <div className="mt-6 columns-1 gap-4 md:columns-2 xl:columns-3">
        {writes.map((sample) => (
          <figure key={sample.tool} className="mb-4 flex break-inside-avoid flex-col gap-1.5" data-tool={sample.tool}>
            <Caption tool={sample.caption} detail="approval" />
            <ApprovalSample sample={sample} />
          </figure>
        ))}
      </div>
    </CardActionsProvider>
  );
}
