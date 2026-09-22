import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TH } from "@/lib/i18n/th";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={TH.nav.admin} description={TH.common.comingSoon} />
      <EmptyState title={TH.empty.admin.title} body={TH.empty.admin.body} />
    </div>
  );
}
