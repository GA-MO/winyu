# Booth QR brochure

A QR code at the Winyu booth replaces the printed brochure. Scanning it opens a one-page mobile brochure that retells the booth film, then asks the visitor to request a demo. Status: planned, not started (decided 2026-10-12).

## Why

- A page can change during the event; print cannot.
- A visitor keeps the page on the phone and reads it later. A leaflet gets lost.
- Sales gets a list of interested people, with consent, instead of business cards.
- Scans and form sends can be counted.

## Audience and job

Visitors who watched the booth film for a minute and want to remember it or talk to sales. The page has one job: let them see the eight points again in under a minute, then ask for a demo.

## Page

One mobile-first page (375 px design width, works up to desktop). It uses the same look as the film: light ground, Anuphan, brand gradient on one word per section, very little text. Thai copy; technical terms may stay English.

| # | Section | Content | Visual |
|---|---|---|---|
| 0 | Hero | Logo, "Winyu", "ผู้ช่วย AI ของทุกคนในองค์กร", button "ขอเดโม" (jumps to the form) | Loop of the film's opening (systems fold into one question), muted, autoplay, inline |
| 1 | หลายระบบ เหลือคำถามเดียว | One line | Still from beat 1 |
| 2 | ตรวจให้ ก่อนคุณตื่น | One line | Still of the morning finding card |
| 3 | บอกครั้งเดียว จำตลอด | One line | Still of the "เพราะคุณสนใจภาคอีสาน" card |
| 4 | ถามอะไร ได้ภาพที่ใช่ | One line | Short clip of the three answer cards (bars, trend, people) |
| 5 | ส่งต่อ ในคลิกเดียว | One line | Still of the forward card and bell |
| 6 | แค่พิมพ์บอก | One line | Still of the phone with the leave balance and confirm |
| 7 | เห็นเท่าที่สิทธิ์ให้ | One line | Still of the sales director vs the sales rep with the hidden number |
| 8 | เชื่อมระบบใหม่ ได้ทันที | One line | Still of the console connecting a system |
| 9 | ขอเดโม | Form (below) | — |
| 10 | Footer | Company contact, privacy notice link | — |

Each section's line is at most 12 Thai words.

The numbers on screen come from the film, which takes them from `film/facts.json`; the page adds no new numbers.

## Assets

- Stills and clips come from the film itself (`film/isometric.html`), not from new mockups.
  - A still is `window.film.render(t)` captured at 2× by headless Chrome.
  - A clip is a short range rendered with `bun run render` in `film/`, cut by a new `--from/--to` option, encoded small for mobile (720p, ~2 Mbit/s, under 3 MB each).
- Extend `film/shots.ts`, which already takes a film and a list of times and writes PNG stills, to write WebP at 2×, so the page assets regenerate when the film changes.
- Every asset must stay readable at 375 px width. Prefer the film's zoomed moments, where text is largest.

## Demo request form

| Field | Required | Note |
|---|---|---|
| ชื่อ–นามสกุล | yes | |
| บริษัท | yes | |
| ตำแหน่ง | no | |
| อีเมลหรือเบอร์โทร | yes | One field; check that it parses as one of the two |
| สนใจเรื่องไหน | no | Chips for the eight points, multi-select |
| ยินยอม (PDPA) | yes | Unticked by default. Text states purpose (contact about a Winyu demo), retention, and how to withdraw; links to the privacy notice |

- Send goes to the company's own system (CRM, or a mailbox for the sales team). Destination to be decided.
- Never store leads in this repo, in `.data`, or in a claude.ai artifact.
- Show a thank-you state on the page. Never claim the message was sent unless the endpoint answered success.
- Add a honeypot field and a rate limit at the endpoint against spam.

## QR

- **Table tent at the booth:** QR plus one line, "สแกนดู Winyu อีกครั้ง · ขอเดโม". Print at least 3 × 3 cm and test from 1 m.
- **End card of the film:** add the QR for the last 4 s of `film/isometric.html`, then re-render. This reverses the earlier no-QR rule for the video, so it needs the user's confirmation first.
- The URL carries UTM parameters, so table scans and screen scans can be told apart: `?utm_source=booth&utm_medium=qr&utm_content=table|screen`.

## Hosting

The page lives on a company domain, not on claude.ai. Use a static host (the page is static except for the form endpoint).

A claude.ai artifact is fine only for internal review of drafts.

## Measurement

Count:

- Page views by `utm_content`
- Form sends
- Which interest chips people pick

Use a privacy-friendly analytics tool, or server logs, with no third-party trackers before consent.

## Later: option B

Add a "ลองถาม Winyu" button that opens a public demo of Winyu. This needs three things first:

- A public deployment
- A per-session and per-day Gemini spend cap
- Rate limits

Add the button only when those exist.

## Decisions needed before building

1. Hosting domain and who deploys it.
2. Form destination (CRM or sales mailbox) and the privacy notice URL.
3. Whether the QR also goes on the film's end card.

## Tasks

- [ ] Get answers to the three decisions above
- [ ] WebP output in `film/shots.ts` and the `--from/--to` option on `film/render.ts`
- [ ] Generate stills and clips from the film; check every one at 375 px
- [ ] Build the page (static HTML, same tokens and font as the film)
- [ ] Form with PDPA consent, honeypot, success and error states; wire to the chosen destination
- [ ] Deploy to the company domain; QR with UTM; print test from 1 m
- [ ] If approved, add the QR to the film's end card and re-render the MP4
- [ ] Walk the page on a real phone (iOS Safari and Android Chrome) before the event

## Done when

- Scanning the printed QR with an iPhone and an Android phone opens the page in under 2 s on 4G.
- All nine sections read without zooming at 375 px.
- A test form send arrives at the chosen destination with the consent recorded.
- Scans can be counted by source.
