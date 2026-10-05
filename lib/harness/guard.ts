import { EMAIL_DOMAIN } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { INVISIBLE_CHARS } from "./fence";

/** Personal data the guard knows how to find in Thai and English text. */
export type PersonalKind = "national_id" | "phone" | "email" | "bank_account";

/** The ways a piece of text tries to steer the model instead of informing it. */
export type InjectionKind = "override" | "persona" | "prompt_leak" | "bypass";

/** Where a guarded piece of text came from: typed by the person, written by the model, or untrusted data re-entering the prompt. */
export type GuardSource = "user_input" | "model_output" | "tool_result" | "memory" | "packet" | "handoff_reply";

export type GuardCheck = "personal_data" | "injection";

/** What the guard did: replaced the data with a label, cut the instruction out, or only recorded it. */
export type GuardAction = "masked" | "neutralized" | "warned";

/** One guard decision as the trace and the audit keep it: its source, check, kinds and action, never the text itself. */
export type GuardFinding = { source: GuardSource; check: GuardCheck; kinds: string[]; action: GuardAction };

type Span<K> = { kind: K; start: number; end: number };

const ALL_PERSONAL: readonly PersonalKind[] = ["national_id", "phone", "email", "bank_account"];
const THAI_ID_DIGITS = 13;
const THAI_ID_WEIGHT_BASE = 13;
const CHECKSUM_MODULUS = 11;
const BANK_CONTEXT_CHARS = 24;
const DIGIT_RUN = /(?<![A-Za-z0-9._/:@-])(?:\+66[ -]?)?\d(?:[ -]?\d){7,15}(?![A-Za-z0-9_/:@]|[.,]\d)/g;
const NATIONAL_ID_GROUPED = /^\d[ -]\d{4}[ -]\d{5}[ -]\d{2}[ -]\d$/;
const BANK_GROUPED = /^\d{3}[ -]\d[ -]\d{5}[ -]\d$/;
const MOBILE = /^0[689]\d{8}$/;
const LANDLINE = /^0[2-7]\d{7}$/;
const BANK_DIGITS = /^\d{10,12}$/;
const BANK_CONTEXT = /(?:บัญชี|account|acct|a\/c|โอน|พร้อมเพย์|promptpay)\D*$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const SENTENCE_END = /\n|[.!?](?=\s|$)/;

/** The shapes of the personal data that has no business in a reply at all, found without context so they work on streamed text: a Thai national ID and a grouped bank account. */
export const NEVER_IN_REPLY: Record<"national_id" | "bank_account", RegExp> = {
  national_id: /(?<![\d-])\d[ -]?\d{4}[ -]?\d{5}[ -]?\d{2}[ -]?\d(?![\d-])/g,
  bank_account: /(?<![\d-])\d{3}-\d-\d{5}-\d(?![\d-])/g,
};

const INJECTION_PATTERNS: readonly { kind: InjectionKind; pattern: RegExp }[] = [
  { kind: "override", pattern: /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,30}?\b(?:previous|prior|above|earlier|all|your|the|system)\b[^.\n]{0,20}?\b(?:instructions?|prompts?|rules?|guidelines?|directives?)\b/gi },
  { kind: "override", pattern: /(?:ลืม|ละเว้น|ไม่ต้องสนใจ|ไม่ต้องทำตาม|เพิกเฉยต่อ|เพิกเฉย)\s*(?:ทุก|ทั้งหมด)?\s*(?:คำสั่ง(?!ซื้อ|ผลิต|จ่าย)|กฎ|ข้อกำหนด|คำแนะนำ)/g },
  { kind: "persona", pattern: /\byou are now\b|\bfrom now on,? you (?:are|will)\b|\bact as (?:an? )?(?:unrestricted|unfiltered|jailbroken)\b|\b(?:developer|god|dan) mode\b|\bjailbreak/gi },
  { kind: "persona", pattern: /(?:จากนี้ไป|จากนี้|ตอนนี้)\s*(?:ให้)?\s*(?:คุณ|เธอ|AI)\s*(?:คือ|ทำตัวเป็น|สวมบทเป็น)/g },
  { kind: "prompt_leak", pattern: /\b(?:reveal|show|print|repeat|output|tell me|leak)\b[^.\n]{0,20}?(?:system prompt|hidden prompt|initial prompt|your instructions|developer message)/gi },
  { kind: "prompt_leak", pattern: /(?:เปิดเผย|แสดง|บอก|พิมพ์|ขอดู|ส่ง)[^\n]{0,16}?(?:system prompt|prompt ระบบ|พรอมต์|พรอมท์|คำสั่งระบบ|คำสั่งลับ|คำสั่งตั้งต้น)/gi },
  { kind: "bypass", pattern: /\b(?:bypass|disable|turn off|ignore|skip)\b[^.\n]{0,20}?\b(?:permissions?|access control|security|guardrails?|safety checks?|scope)\b/gi },
  { kind: "bypass", pattern: /(?:ข้าม|หลบ|เลี่ยง|ไม่ต้องเช็ค|ไม่ต้องตรวจ)\s*(?:การ)?(?:ตรวจ)?\s*(?:สิทธิ์|สิทธิ|ความปลอดภัย|ขอบเขต)/g },
];

function thaiIdChecksumHolds(digits: string): boolean {
  const values = [...digits].map(Number);
  const sum = values.slice(0, THAI_ID_DIGITS - 1).reduce((total, digit, index) => total + digit * (THAI_ID_WEIGHT_BASE - index), 0);
  return (CHECKSUM_MODULUS - (sum % CHECKSUM_MODULUS)) % 10 === values[THAI_ID_DIGITS - 1];
}

function digitsOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return raw.startsWith("+66") ? `0${digits.slice(2)}` : digits;
}

function kindOfDigits(raw: string, before: string): PersonalKind | null {
  const digits = digitsOf(raw);
  if (digits.length === THAI_ID_DIGITS && (NATIONAL_ID_GROUPED.test(raw) || thaiIdChecksumHolds(digits))) return "national_id";
  if (BANK_GROUPED.test(raw)) return "bank_account";
  if (MOBILE.test(digits) || LANDLINE.test(digits)) return "phone";
  if (BANK_DIGITS.test(digits) && BANK_CONTEXT.test(before.slice(-BANK_CONTEXT_CHARS))) return "bank_account";
  return null;
}

function isWorkEmail(domain: string): boolean {
  const lower = domain.toLowerCase();
  return lower === EMAIL_DOMAIN || lower.endsWith(`.${EMAIL_DOMAIN}`);
}

/** Every piece of personal data in the text, in order: Thai national IDs (grouped or with a valid checksum), Thai phone numbers, personal email addresses (a colleague's work address is directory data, not personal), and bank account numbers (grouped, or named as an account). */
export function personalDataIn(text: string): Span<PersonalKind>[] {
  const emails = [...text.matchAll(EMAIL)].flatMap((match) => (isWorkEmail(match[1] ?? "") ? [] : [{ kind: "email" as const, start: match.index, end: match.index + match[0].length }]));
  const numbers = [...text.matchAll(DIGIT_RUN)].flatMap((match) => {
    const start = match.index;
    const end = start + match[0].length;
    if (emails.some((email) => start < email.end && end > email.start)) return [];
    const kind = kindOfDigits(match[0], text.slice(0, start));
    return kind ? [{ kind, start, end }] : [];
  });
  return [...emails, ...numbers].sort((left, right) => left.start - right.start);
}

function kindsOf<K extends string>(spans: readonly Span<K>[]): K[] {
  return [...new Set(spans.map((span) => span.kind))];
}

function replaced<K extends string>(text: string, spans: readonly Span<K>[], label: (kind: K) => string): string {
  return [...spans].sort((left, right) => right.start - left.start).reduce((result, span) => `${result.slice(0, span.start)}${label(span.kind)}${result.slice(span.end)}`, text);
}

/** The text with each piece of personal data of the given kinds replaced by a Thai label, and the kinds it replaced. */
export function maskPersonalData(text: string, kinds: readonly PersonalKind[] = ALL_PERSONAL): { text: string; kinds: PersonalKind[] } {
  const spans = personalDataIn(text).filter((span) => kinds.includes(span.kind));
  return { text: replaced(text, spans, (kind) => TH.guard.mask[kind]), kinds: kindsOf(spans) };
}

function sentenceEnd(text: string, from: number): number {
  const rest = text.slice(from).search(SENTENCE_END);
  return rest < 0 ? text.length : from + rest;
}

function merged<K>(spans: Span<K>[]): Span<K>[] {
  return spans.sort((left, right) => left.start - right.start).reduce<Span<K>[]>((kept, span) => {
    const last = kept.at(-1);
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      return kept;
    }
    return [...kept, { ...span }];
  }, []);
}

function injectionSpans(text: string): Span<InjectionKind>[] {
  return INJECTION_PATTERNS.flatMap(({ kind, pattern }) => [...text.matchAll(pattern)].map((match) => ({ kind, start: match.index, end: match.index + match[0].length })));
}

/** The kinds of instruction the text tries to give the model, read with hidden characters removed so they cannot split a phrase. */
export function injectionIn(text: string): InjectionKind[] {
  return kindsOf(injectionSpans(text.replace(INVISIBLE_CHARS, "")));
}

/** Untrusted text with every instruction to the model cut out to the end of its sentence, and the kinds it cut; hidden characters are removed first. */
export function withoutInjection(text: string): { text: string; kinds: InjectionKind[] } {
  const visible = text.replace(INVISIBLE_CHARS, "");
  const spans = injectionSpans(visible);
  if (spans.length === 0) return { text: visible, kinds: [] };
  const cut = merged(spans.map((span) => ({ ...span, end: sentenceEnd(visible, span.end) })));
  return { text: replaced(visible, cut, () => TH.guard.cut), kinds: kindsOf(spans) };
}
