"use client";

import { EmptyLine, Panel } from "@/components/admin/parts";
import { ROLE_IDS, type RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { ToolDraft } from "./model";
import type { ToolPatch } from "./wizard";

const COPY = TH.connectorUi.roles;

function toggled(roles: readonly RoleId[], role: RoleId, on: boolean): RoleId[] {
  return on ? ROLE_IDS.filter((id) => id === role || roles.includes(id)) : roles.filter((id) => id !== role);
}

export function RolesStep({ tools, patchTool }: { tools: ToolDraft[]; patchTool: (name: string, patch: ToolPatch) => void }) {
  return (
    <Panel title={TH.connectorUi.steps.roles} hint={COPY.hint} bodyClassName="overflow-x-auto">
      {tools.length === 0 ? (
        <EmptyLine text={COPY.empty} />
      ) : (
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="py-2 pr-3 text-left font-medium">{TH.connectorUi.card.columns.tool}</th>
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
                  <p className="font-medium">{tool.labelTh || tool.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
                </td>
                {ROLE_IDS.map((role) => (
                  <td key={role} className="px-1 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${tool.labelTh || tool.name} · ${TH.role[role]}`}
                      checked={tool.roles.includes(role)}
                      onChange={(event) => patchTool(tool.name, (current) => ({ ...current, roles: toggled(current.roles, role, event.target.checked) }))}
                      className="size-4 accent-[var(--color-ink)]"
                    />
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right text-[12px] tabular-nums text-muted-foreground">{COPY.count(tool.roles.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
