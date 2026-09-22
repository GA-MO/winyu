# Cop

Enterprise copilot on Vexa for a fictional Thai beverage company. Every user signs in as a persona; the agent answers with generative UI scoped to that persona's data.

## Run

```bash
bun install
bun run dev          # http://localhost:3100 (redirects to /login until a persona is chosen)
bun run typecheck
bun run test
bun run seed         # clears .data/*.json (user state: threads, memory, packets)
```

Vexa is consumed from the sibling checkout `../agentic-ui` (see `docs/plan.md` §3): tsconfig `paths` and `app/globals.css` point at `../agentic-ui/src`, `next.config.ts` allows that tree through `outputFileTracingRoot` and aliases `ai`, `ai/test` and `@ai-sdk/react` to Cop's copies so both trees share one module instance. Keep `ai`, `@ai-sdk/react` and `zod` pinned to the versions `../agentic-ui/node_modules` resolves.

Without `ANTHROPIC_API_KEY` in `.env.local` the model picker offers only `mock` (scripted replies, free). With the key set, `claude-sonnet-5` becomes the default and `claude-haiku-4-5-20251001` is also listed. Copy `.env.example` to `.env.local`.

## Personas

Pick one on `/login`; the top bar switches personas without signing out. Session cookie: `cop_session=<userId>` (httpOnly), set by `POST /api/session { userId }`, cleared by `DELETE /api/session`.

| User id | Name | Role | Scope |
|---|---|---|---|
| `u_thana` | คุณธนา วงศ์สกุล | ceo | ทั่วประเทศ, every metric |
| `u_siriporn` | คุณศิริพร รัตนกร | cfo | ทั่วประเทศ, avg_salary masked |
| `u_prasit` | คุณประสิทธิ์ ชัยภูมิ | sales_director | ทั่วประเทศ |
| `u_anucha` | คุณอนุชา พรหมศรี | sales_rsm | ภาคอีสาน only |
| `u_kanok`, `u_somchai`, `u_nattaya`, `u_wichai`, `u_saranya` | RSMs | sales_rsm | own region |
| `u_krit`, `u_nok`, `u_ploy`, `u_beam`, `u_arm`, `u_golf`, `u_ice` | sales reps | sales_rep | own region, no handoff/email tools |
| `u_ben` | คุณเบญ เตชะวงศ์ | marketing_lead | all regions, finance masked |
| `u_pim`, `u_fah`, `u_bank` | trade/brand marketing | marketing_lead | as above |
| `u_wee`, `u_oat` | คุณวีร์ เจริญสุข, คุณโอ๊ต | supply_planner | supply metrics |
| `u_mint`, `u_earn` | finance analysts | finance_analyst | finance full, HR none |
| `u_may` | คุณเมย์ กิตติศักดิ์ | hr_manager | HR incl. avg_salary |
| `u_ton` | คุณต้น อรุณรัตน์ | it_admin | run_job tool |

The full table with titles and managers is `lib/data/entities/users.ts`; the role policy table is `lib/access/policies.ts`.

## Ports

| Port | What |
|---|---|
| 3100 | Cop (`bun run dev`) |
| 3001 | Vexa shop-admin reference host (`bun run dev` inside `../agentic-ui`) |

## Layout

```
app/                 App Router: (app)/ shell routes, login/, api/chat, api/session
components/shell/    sidebar, top bar, persona switcher, cards, empty states
lib/contracts/       types + zod schemas every package builds against (docs/plan.md §4)
lib/access/          role → regions / brands / metric ACL / tool allow list
lib/data/entities/   hand-written entity tables (users)
lib/server/          session, request context (AsyncLocalStorage), models, mock script, JSON store, agent handler
lib/i18n/th.ts       every UI string
scripts/             seed, happy-dom test preload
```
