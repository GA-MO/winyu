import { crmDemoConnector } from "./crm-demo";
import { lmsDemoConnector } from "./lms-demo";
import type { McpConnector } from "./types";

/** The connectors declared in code with `defineMcpConnector`. */
export const CODE_CONNECTORS: readonly McpConnector[] = [lmsDemoConnector, crmDemoConnector];
