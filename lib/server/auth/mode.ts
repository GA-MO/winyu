export const AUTH_MODES = ["demo", "entra"] as const;

/** How people sign in: `entra` through Microsoft Entra ID, `demo` through the persona picker. */
export type AuthMode = (typeof AUTH_MODES)[number];

const AUTH_MODE_ENV = "WINYU_AUTH";

function isAuthMode(value: string): value is AuthMode {
  return AUTH_MODES.some((mode) => mode === value);
}

/** WINYU_AUTH when set; unset means `demo` in development and `entra` in production, so a deploy never opens the persona picker by accident. */
export function authMode(): AuthMode {
  const value = process.env[AUTH_MODE_ENV];
  if (!value) return process.env.NODE_ENV === "production" ? "entra" : "demo";
  if (isAuthMode(value)) return value;
  throw new Error(`${AUTH_MODE_ENV} must be one of ${AUTH_MODES.join(", ")} (got "${value}")`);
}
