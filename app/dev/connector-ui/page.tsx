import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Pill } from "@/components/admin/parts";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";
import { lmsDemoEnv } from "@/lib/server/connectors/lms-demo-config";
import { ASSET_URL, LEAVE_URL, REQUISITION_URL } from "./fixtures";
import type { Person } from "./parts";
import type { Example } from "./step-connect";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

const COPY = TH.connectorUi;
const PATH = "/dev/connector-ui";
const LMS_COPY_URL = "http://127.0.0.1:3289/mcp";

function examples(): Example[] {
  const names = COPY.connect.exampleNames;
  return [
    { key: "lms", id: "lms_ui", labelTh: names.lms, url: process.env.WINYU_CONNECTOR_UI_LMS_URL ?? LMS_COPY_URL, auth: "signed_identity", secret: lmsDemoEnv().secret },
    { key: "asset", id: "asset", labelTh: names.asset, url: ASSET_URL, auth: "signed_identity", secret: "asset-demo-secret-7Q2x" },
    { key: "requisition", id: "requisition", labelTh: names.requisition, url: REQUISITION_URL, auth: "bearer", secret: "req-demo-token-9Lm4" },
    { key: "leave", id: "hris_leave", labelTh: names.leave, url: LEAVE_URL, auth: "signed_identity", secret: "leave-demo-secret-3Vt8" },
  ];
}

function people(): Person[] {
  return USERS.map((user) => ({ id: user.id, nameTh: user.nameTh, role: user.role, scopeTh: user.region ? TH.region[user.region] : TH.region.all }));
}

/** Development only: the connect-a-system wizard for IT admins, with real MCP discovery against a loopback server and mocked asset, requisition and leave systems. */
export default async function ConnectorUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const user = readUser(await cookies());
  if (!user) redirect(`/login?next=${PATH}`);
  if (user.role !== "it_admin") notFound();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/admin?tab=tools" className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden />
          {COPY.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{COPY.title}</h1>
          <Pill tone="warning">{COPY.prototype}</Pill>
        </div>
        <p className="max-w-2xl text-[14px] text-muted-foreground">{COPY.lead}</p>
      </header>
      <Wizard people={people()} examples={examples()} />
    </main>
  );
}
