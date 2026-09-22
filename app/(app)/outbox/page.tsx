import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TH } from "@/lib/i18n/th";

export default function OutboxPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={TH.nav.outbox} description={TH.common.comingSoon} />
      <EmptyState title={TH.empty.outbox.title} body={TH.empty.outbox.body} />
    </div>
  );
}
