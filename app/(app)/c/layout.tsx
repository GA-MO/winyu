import { CopilotProvider } from "@/components/providers/copilot-provider";
import { ThreadRail } from "@/components/threads/rail";

/** The chat area: the thread rail beside the conversation, and the one CopilotKit runtime connection for it. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-3.75rem)] min-h-0">
      <ThreadRail />
      <CopilotProvider>{children}</CopilotProvider>
    </div>
  );
}
