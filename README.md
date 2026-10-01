# California Hearing Center — Hearing Benefits Checker (ChatGPT App)

A ChatGPT app (MCP server + Apps SDK widget) that answers *"does insurance cover
hearing aids?"* inside ChatGPT conversations, built for **California Hearing
Center** (San Mateo & San Carlos, CA).

When someone asks ChatGPT about hearing coverage — *"does Medicare cover hearing
aids"*, *"how much do hearing aids cost with my insurance"*, *"can I use my HSA
for hearing aids"* — ChatGPT can recommend this app. The user answers 6 quick
questions about their coverage (age 65+, coverage type, doctor referral, known
hearing benefit, HSA/FSA, what they're looking for) and gets a plain-language
read on what **typically** applies to people with their coverage type — Traditional
Medicare, Medicare Advantage, private/commercial, employer plan, VA health care,
Medicaid, or self-pay — plus a **free benefit check** callback request.

## The one hard rule

This app is **general information only**. It never promises coverage, never quotes
a benefit amount, and never tells anyone their plan covers something. Every
outcome ends with the same sentence:

> This is general information, not a coverage decision — book a benefit check
> and we'll verify your specific plan before anything costs you a cent.

⚠️ **Outcome copy needs review (Au.D. / practice sign-off) before public
promotion or App Directory submission.** Every API response carries a
`clinicalReviewRequired` flag as a reminder.

## How it works

```
User asks ChatGPT "does insurance cover hearing aids"
        │  (ChatGPT recommends the app — the "empty slot")
        ▼
start_benefits_check  →  interactive widget (ui://widget/insurance-checker.html)
        │  6 questions: 65+, coverage type, referral, known benefit, HSA/FSA,
        │  looking for (aids / exam / both)
        ▼
assess_hearing_benefits  →  server routes to 1 of 7 plain-language outcomes
        │  widget renders outcome inline + benefit-check callback form
        ▼
submit_screening_lead → saved to data/leads.jsonl (+ optional Resend email,
                         + optional webhook) → confirmation
```

A fourth tool, `get_practice_info`, lets ChatGPT answer "where are you located /
what's your phone number" from your real data in `src/practices.js`.

## Outcome logic (`src/benefits.js`)

| Coverage type | What typically applies (general info) |
|---|---|
| Traditional Medicare | Generally does NOT cover hearing aids or routine exams; diagnostic exams usually need a doctor's referral |
| Medicare Advantage | Often includes a hearing benefit, but varies widely by plan — must check the specific plan |
| Private / commercial | Varies widely; sometimes exams covered, hearing-aid allowances differ |
| Employer plan | Many include some hearing coverage; check benefits portal or HR |
| VA | Eligible veterans often get hearing care covered; eligibility can be confirmed with the VA |
| Medicaid (Medi-Cal) | Many state programs include hearing benefits; details differ by state |
| Self-pay | HSA/FSA funds can usually be used; payment plans; get itemized quotes |

Every outcome: headline + bullets + recommended next step + notes layered on
(referral, HSA/FSA, age 65+) + the mandated closing sentence + disclaimer.

## Project layout

| Path | What it is |
|---|---|
| `src/server.js` | HTTP entrypoint — serves the MCP server at `POST /mcp` (Streamable HTTP; one transport + server per Mcp-Session-Id) |
| `src/tools.js` | The 4 MCP tools (descriptions written in patients' own search phrases) |
| `src/widgets.js` | Registers the widget resource (`text/html+skybridge`) |
| `src/widgets/insurance.html` | The interactive UI: intro → 6 questions → outcome → callback form (CHC teal/gold theme) |
| `src/benefits.js` | Outcome routing per coverage type (general info only) — unit tested |
| `src/practices.js` | Practice info, addresses, hours, services — baked in, no TODOs |
| `src/leads.js` | Lead storage (JSONL) + Resend email notifications + optional webhook POST |
| `test/benefits.test.js` | `npm test` — outcome routing, validation, no-coverage-promise guard, email body |
| `test/e2e.mjs` | `npm run test:e2e` — full MCP round-trip against a running server |

## Quickstart (local)

```bash
npm install
npm test        # benefits outcome unit tests (no server needed)
npm start       # serves POST /mcp on :8787, GET /health for checks

# end-to-end MCP check against a running server (in another terminal):
npm run test:e2e            # uses http://127.0.0.1:8787
MCP_URL=https://<host>/mcp npm run test:e2e   # against a deployed server
```

### Try it in ChatGPT (developer mode)

1. Expose your machine: `ngrok http 8787` (any HTTPS tunnel works).
2. In ChatGPT: Settings → Apps & Connectors → Advanced settings → enable **developer mode**.
3. Settings → Connectors → Create → paste `https://<your-tunnel>/mcp`, name it "Hearing Benefits Checker".
4. New chat → **+** → More → select it → type *"does Medicare cover hearing aids?"*.

### Deploy

**One-click (Render, free tier works for testing):**

1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint** → select the repo (`render.yaml` is picked up automatically; `Dockerfile` handles the build).
3. Render gives you a public URL like `https://chc-insurance-check.onrender.com`.
4. Your MCP endpoint is `https://chc-insurance-check.onrender.com/mcp`.
5. In Render → Environment, add the four env vars (see "Lead email notifications").

**Any other host:**

Any host that runs Node 20+ with a public HTTPS URL works (VPS, Render, Railway,
Fly.io…). Set `PORT` and the env vars below. Point the App Directory submission
(or connector) at `https://<your-host>/mcp`.

## Lead email notifications

Every benefit-check request is saved to `data/leads.jsonl` and can also be
emailed to the practice inbox. To turn it on:

1. Use the practice's existing Resend API key (the site forms already use Resend).
2. In the Render dashboard, open the service → **Environment** and add:
   - `RESEND_API_KEY` = the practice's key
   - `LEAD_NOTIFY_EMAIL` = `infoCHC@hearing-care.org` (comma-separated for several)
   - `LEAD_FROM_EMAIL` = `California Hearing Center <admin@hearing-care.org>`
   - `APP_LABEL` = `Hearing Benefits Checker`
3. Save — Render redeploys automatically.

Each email's subject is `New callback request (Hearing Benefits Checker): <name> — <office>`,
and the body lists everything the patient entered: name, **email** (required),
phone, office, preferred time, outcome, the "Their answers" per-question summary,
plus a reference ID and timestamp. Sending never blocks the chat — if email
fails, the lead is still saved locally.

## Compliance notes

- **General information only** — stated in the widget intro, results screen, tool
  descriptions, and every API response. The app never promises coverage or quotes
  benefits. Outcome copy still needs Au.D./practice sign-off before public
  promotion (see the `clinicalReviewRequired` flag).
- **Consent** — contact details are collected only via an explicit checkbox;
  email is the required contact, phone is optional (TCPA: add written SMS consent
  before texting).
- **Data** — minimum necessary (name, email, phone, location, outcome, answers).
  Wire the webhook to a vendor with a signed BAA if results flow into clinical systems.
- **Accessibility** — large senior-friendly tap targets; no audio steps in this widget.

## What this build does not do

- It cannot submit itself to the App Directory — that needs the practice's (or
  developer's) verified OpenAI developer account.
- It hasn't been tested inside ChatGPT yet — that needs developer mode on an
  account with access, which I don't have.
- Outcome copy hasn't had clinical sign-off (see note at the top).
