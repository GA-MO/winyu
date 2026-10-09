"use client";

import { EmptyLine, Panel } from "@/components/admin/parts";
import { ROLE_IDS } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { toggledRole } from "./model";
import type { WizardContext } from "./wizard";

const COPY = TH.connectorUi.roles;

export function RolesStep({ context }: { context: WizardContext }) {
  const tools = context.tools.filter((tool) => tool.include && tool.listed);
  return (
    <Panel title={TH.connectorUi.steps.roles} hint={COPY.hint} bodyClassName="overflow-x-auto">
      {tools.length === 0 ? (
        <EmptyLine text={COPY.empty} />
      ) : (
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="py-2 pr-3 text-left font-medium">{COPY.tool}</th>
              {ROLE_IDS.map((role) => (
                <th key={role} className="px-1 py-2 text-center font-medium" title={TH.role[role]}>
                  {TH.roleShort[role]}
                </th>
              ))}
              <th className="py-2 pl-3 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => (
              <tr key={tool.name} className="border-t border-border">
                <td className="py-2.5 pr-3">
                  <p className="font-medium">{tool.draft.labelTh || tool.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
                </td>
                {ROLE_IDS.map((role) => (
                  <td key={role} className="px-1 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${tool.draft.labelTh || tool.name} · ${TH.role[role]}`}
                      checked={tool.draft.roles.includes(role)}
                      onChange={(event) => context.patchDraft(tool.name, (draft) => ({ ...draft, roles: toggledRole(draft.roles, role, event.target.checked) }))}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right text-[12px] tabular-nums text-muted-foreground">{COPY.count(tool.draft.roles.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
