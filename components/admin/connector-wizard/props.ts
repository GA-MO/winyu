import type { User } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ConnectorView, CoreCase } from "@/lib/connectors/spec";
import { connectorView, serverSettings } from "@/lib/server/connectors/admin";
import { coreCasesForCheck } from "@/lib/server/connectors/model-check";
import type { Person } from "./parts";
import type { Settings } from "./wizard";

/** The recorded questions a model check can ask again and what one question costs, as the wizard shows them before anything is spent. */
export type CheckOptions = { cases: CoreCase[]; perQuestionUsd: number };

export type ConnectorWizardProps = { initial: ConnectorView | null; settings: Settings; people: Person[]; checks: CheckOptions };

function people(): Person[] {
  return USERS.map((user) => ({ id: user.id, nameTh: user.nameTh, role: user.role, scopeTh: user.region ? TH.region[user.region] : TH.region.all }));
}

/** What the wizard page hands the client: the connector's view (no secret), the server's read-only settings and the people to test as; null for anyone but IT or an unknown id. */
export function connectorWizardProps(actor: User | null, id: string | null): ConnectorWizardProps | null {
  const settings = serverSettings(actor);
  if (!settings) return null;
  const initial = id ? connectorView(actor, id) : null;
  if (id && !initial) return null;
  return { initial, settings, people: people(), checks: coreCasesForCheck() };
}
