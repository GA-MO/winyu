import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TH } from "@/lib/i18n/th";

export default function MemoryPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={TH.nav.memory} description={TH.common.comingSoon} />
      <EmptyState title={TH.empty.memory.title} body={TH.empty.memory.body} />
    </div>
  );
}
