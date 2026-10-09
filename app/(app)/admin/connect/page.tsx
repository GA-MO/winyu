import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Pill } from "@/components/admin/parts";
import { ConnectorWizard } from "@/components/admin/connector-wizard/wizard";
import { connectorWizardProps } from "@/components/admin/connector-wizard/props";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const COPY = TH.connectorUi;
const PATH = "/admin/connect";

type SearchParams = Promise<{ id?: string }>;

/** The connect-a-system wizard for IT admins: a new connector, or `?id=` to continue or edit one made here. */
export default async function ConnectPage({ searchParams }: { searchParams: SearchParams }) {
  const user = readUser(await cookies());
  if (!user) redirect(`/login?next=${PATH}`);
  const props = connectorWizardProps(user, (await searchParams).id ?? null);
  if (!props) notFound();
  const title = props.initial ? COPY.editTitle(props.initial.connector.labelTh) : COPY.title;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/admin?tab=tools" className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          {COPY.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{title}</h1>
          {props.initial ? <Pill>{COPY.states[props.initial.state]}</Pill> : null}
        </div>
        <p className="max-w-2xl text-[14px] text-muted-foreground">{COPY.lead}</p>
      </header>
      <ConnectorWizard {...props} />
    </main>
  );
}
