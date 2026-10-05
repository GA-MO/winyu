const HOME = "/";

/** Only a path inside the app may follow sign-in, so a crafted link cannot send the user elsewhere. */
export function safeNextPath(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : HOME;
}
