import { GlobalRegistrator } from "@happy-dom/global-registrator";

const PAGE_URL = "http://localhost:3100/";
const NATIVE_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "TextDecoder",
  "TextEncoder",
  "AbortController",
  "AbortSignal",
  "URL",
  "URLSearchParams",
  "Blob",
  "FormData",
] as const;

/** Registers happy-dom as the global document once and keeps Bun's own network and stream classes, so DOM code and HTTP calls to the dev server share one process. */
export function registerDom(options: { actEnvironment: boolean }) {
  if (typeof document !== "undefined") return;
  const natives = Object.fromEntries(NATIVE_GLOBALS.map((name) => [name, globalThis[name]]));
  GlobalRegistrator.register({ url: PAGE_URL });
  Object.assign(globalThis, natives, { IS_REACT_ACT_ENVIRONMENT: options.actEnvironment });
}
