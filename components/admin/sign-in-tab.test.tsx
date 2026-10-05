import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { dismissAttempt, identityKey, identityLinks, linkIdentity, noteUnlinkedAttempt, unlinkIdentity, unlinkedAttempts, type ExternalIdentity } from "@/lib/server/identity";
import { TH } from "@/lib/i18n/th";
import { SignInTab } from "./sign-in-tab";

const COPY = TH.sso.admin;
const TENANT = "tenant-under-test";

function person(subject: string, email: string | null, name: string | null): ExternalIdentity {
  return { provider: "entra", tenant: TENANT, subject, email, name };
}

afterEach(() => {
  for (const attempt of unlinkedAttempts()) dismissAttempt(attempt.id);
  for (const link of identityLinks()) unlinkIdentity(link.id);
});

describe("SignInTab", () => {
  test("a waiting person whose email matches a persona is offered that persona already selected", () => {
    noteUnlinkedAttempt(person("oid-beam", "beam@boonrawd-demo.co.th", "Beam Panyarat"), "2026-10-05T09:00:00Z");
    const html = renderToStaticMarkup(<SignInTab />);
    expect(html).toContain("oid-beam");
    expect(html).toContain(`${COPY.suggested}: คุณบีม ปัญญารัตน์`);
    expect(html).toMatch(/<option value="u_beam" selected="">/);
  });

  test("an outsider is listed with nobody preselected", () => {
    noteUnlinkedAttempt(person("oid-guest", "guest@example.com", "Guest"), "2026-10-05T09:00:00Z");
    const html = renderToStaticMarkup(<SignInTab />);
    expect(html).toContain("guest@example.com");
    expect(html).not.toContain(COPY.suggested);
    expect(html).not.toMatch(/<option value="u_[a-z]+" selected="">/);
  });

  test("linked accounts show who they are linked to and who linked them, and nobody waits once linked", () => {
    const beam = person("oid-linked", "beam@boonrawd-demo.co.th", "Beam");
    noteUnlinkedAttempt(beam, "2026-10-05T09:00:00Z");
    linkIdentity(beam, "u_beam", "u_ton", "2026-10-05T10:00:00Z");
    const html = renderToStaticMarkup(<SignInTab />);
    expect(html).toContain(`${COPY.pending} (0)`);
    expect(html).toContain(`${COPY.linked} (1)`);
    expect(html).toContain(`value="${identityKey(beam)}"`);
    expect(html).toContain("ผูกโดย คุณต้น");
  });
});
