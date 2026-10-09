import { TH } from "@/lib/i18n/th";
import { mailHtml, type MailLayout } from "@/lib/server/share/message";

/** A mail ready for the outbox: its subject, a plain body, and the same as HTML. */
export type GrantMail = { subject: string; body: string; html: string };

/** What a request mail says: who asks and their title, the slice in words, their reason as they wrote it, the card it came from, and the approval page. */
export type RequestMailInput = { requesterName: string; requesterTitle: string; slice: string; reason: string; cardTitle: string | null; url: string };

/** How a request was decided, for the mail to its requester. */
export type DecisionMailInput =
  | { outcome: "approved"; approverName: string; slice: string; until: string; url: string }
  | { outcome: "declined"; deciderName: string; slice: string };

const COPY = TH.grant.mail;

function plainOf(layout: MailLayout): string {
  const button = layout.button ? [`${layout.button.label}: ${layout.button.url}`] : [];
  return [layout.lead, layout.heading, ...(layout.quote ? [layout.quote] : []), ...button, ...layout.foot].join("\n\n");
}

function mailOf(subject: string, layout: MailLayout): GrantMail {
  return { subject, body: plainOf(layout), html: mailHtml(layout) };
}

/** The mail an approver gets: a พิจารณาคำขอ button to the approval page; the reason is the requester's own text, escaped like any other. */
export function grantRequestMail(input: RequestMailInput): GrantMail {
  return mailOf(COPY.requestSubject(input.requesterName, input.slice), {
    lead: COPY.requestLead(input.requesterName, input.requesterTitle),
    heading: input.slice,
    quote: input.reason ? COPY.reason(input.reason) : COPY.noReason,
    button: { label: COPY.decide, url: input.url },
    foot: [...(input.cardTitle ? [COPY.fromCard(input.cardTitle)] : []), COPY.decideNote],
  });
}

/** The mail a requester gets once their request is decided: approved names who and until when with a button back to the card; declined says who, without a button. */
export function grantDecisionMail(input: DecisionMailInput): GrantMail {
  if (input.outcome === "approved") {
    return mailOf(COPY.approvedSubject(input.approverName, input.slice), {
      lead: COPY.approvedLead(input.approverName),
      heading: input.slice,
      quote: null,
      button: { label: COPY.openCard, url: input.url },
      foot: [COPY.until(input.until)],
    });
  }
  return mailOf(COPY.declinedSubject(input.deciderName, input.slice), { lead: COPY.declinedLead(input.deciderName), heading: input.slice, quote: null, button: null, foot: [COPY.declinedNote] });
}
