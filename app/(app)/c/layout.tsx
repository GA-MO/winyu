import { CopilotProvider } from "@/components/providers/copilot-provider";

/** The chat area: the one CopilotKit runtime connection for the conversation. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-3.75rem)] min-h-0">
      <CopilotProvider>{children}</CopilotProvider>
    </div>
  );
}
