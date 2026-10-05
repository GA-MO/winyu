"use client";

import type { ReactNode } from "react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";

const RUNTIME_URL = "/api/copilotkit";

/** The chat agent's name on the runtime (the Mastra agent id). */
export const CHAT_AGENT_ID = "mascop";

type Filterable = { role: string };

/** Sends only the newest question and what followed it: Mastra memory already holds the rest of the thread, and the run still reads the question it answers. */
export function sinceLastQuestion<T extends Filterable>(messages: T[]): T[] {
  const lastQuestion = messages.findLastIndex((message) => message.role === "user");
  return lastQuestion < 0 ? messages : messages.slice(lastQuestion);
}

/** The CopilotKit runtime connection, mounted only where a chat lives so other pages open no runtime connection. */
export function CopilotProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotKitProvider runtimeUrl={RUNTIME_URL} agentId={CHAT_AGENT_ID} messageFilter={sinceLastQuestion} enableInspector={false}>
      {children}
    </CopilotKitProvider>
  );
}
