import { NATIVE_CONNECTORS, type ConnectorDef } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

/** The systems Cop's own tools read through its ports, plus Cop itself. */
export function nativeConnectors(): ConnectorDef[] {
  return NATIVE_CONNECTORS.map((id) => ({ id, labelTh: TH.admin.connectors[id].label, sourceSystemTh: TH.admin.connectors[id].source, kind: "native" }));
}
