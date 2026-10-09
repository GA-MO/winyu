import type { User } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ConnectorView } from "@/lib/connectors/spec";
import { connectorView, serverSettings } from "@/lib/server/connectors/admin";
import type { Person } from "./parts";
import type { Settings } from "./wizard";

export type ConnectorWizardProps = { initial: ConnectorView | null; settings: Settings; people: Person[] };

function people(): Person[] {
  return USERS.map((user) => ({ id: user.id, nameTh: user.nameTh, role: user.role, scopeTh: user.region ? TH.region[user.region] : TH.region.all }));
}

/** What the wizard page hands the client: the connector's view (no secret), the server's read-only settings and the people to test as; null for anyone but IT or an unknown id. */
export function connectorWizardProps(actor: User | null, id: string | null): ConnectorWizardProps | null {
  const settings = serverSettings(actor);
  if (!settings) return null;
  const initial = id ? connectorView(actor, id) : null;
  if (id && !initial) return null;
  return { initial, settings, people: people() };
}
