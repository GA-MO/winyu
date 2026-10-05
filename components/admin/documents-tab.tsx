import { FileText, RefreshCw } from "lucide-react";
import { ROLE_IDS } from "@/lib/contracts";
import { formatDateTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { corpusStatus, type DocumentStatus, type IndexState } from "@/lib/server/documents/index-documents";
import { reindexDocumentsAction } from "@/app/(app)/admin/documents-actions";
import { EmptyLine, INK, Panel, Pill, Stat, stamp } from "./parts";

const COPY = TH.admin.documentsTab;
const STATE_TONE: Record<IndexState, "success" | "warning" | "danger"> = { current: "success", stale: "warning", missing: "danger" };

function Audience({ readers }: { readers: DocumentStatus["readers"] }) {
  if (readers.length === ROLE_IDS.length) return <Pill tone="primary">{COPY.everyone}</Pill>;
  return (
    <>
      {readers.map((role) => (
        <Pill key={role}>{TH.role[role]}</Pill>
      ))}
    </>
  );
}

function DocumentRow({ status }: { status: DocumentStatus }) {
  const { header } = status;
  const facts = [header.id, COPY.version(header.version), COPY.effective(formatDateTh(header.effective)), COPY.owner(header.owner)];
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-t border-border px-5 py-3.5 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <FileText className="mt-0.5 size-4 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{header.title}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{facts.join(" · ")}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Audience readers={status.readers} />
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end">
        <Pill tone={STATE_TONE[status.state]}>{COPY.state[status.state]}</Pill>
        <span className="text-[11px] tabular-nums text-muted-foreground">{COPY.coverage(status.indexed, status.sections)}</span>
        {status.indexedAt ? <span className="text-[11px] text-muted-foreground">{COPY.indexedAt(stamp(status.indexedAt))}</span> : null}
      </div>
    </li>
  );
}

/** Admin tab for the company documents: what search_documents can find, who may read each document, from when it applies, and whether the index matches the files. */
export async function DocumentsTab() {
  const status = await corpusStatus();
  const reindex = (
    <form action={reindexDocumentsAction}>
      <button type="submit" className={INK} title={COPY.reindexHint}>
        <RefreshCw className="size-4" aria-hidden />
        {COPY.reindex}
      </button>
    </form>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label={COPY.documents} value={String(status.documents.length)} />
        <Stat label={COPY.sections} value={String(status.chunks)} sub={COPY.sectionsSub(status.indexedChunks, status.chunks)} tone={status.indexedChunks === status.chunks ? "success" : "warning"} />
      </div>
      <Panel title={COPY.title} hint={COPY.hint} action={reindex} bodyClassName="px-0 pb-2 pt-3">
        {status.documents.length === 0 ? (
          <div className="px-5 pb-3">
            <EmptyLine text={COPY.empty} />
          </div>
        ) : (
          <ul className="flex flex-col">
            {status.documents.map((document) => (
              <DocumentRow key={document.header.id} status={document} />
            ))}
          </ul>
        )}
      </Panel>
      {status.broken.length > 0 || status.orphaned.length > 0 ? (
        <Panel title={COPY.broken}>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {status.broken.map((file) => (
              <li key={file.file}>
                <span className="font-mono">{file.file}</span>
                <span className="text-muted-foreground">{` · ${file.reason}`}</span>
              </li>
            ))}
            {status.orphaned.map((id) => (
              <li key={id} className="text-muted-foreground">
                <span className="font-mono text-foreground">{id}</span>
                {` · ${COPY.orphaned}`}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
