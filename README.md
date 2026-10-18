# Interview Prep Kit

Paste a job description, add the company website and the number of days you have, and the app researches the company and builds a complete interview prep kit: company brief, role breakdown, categorised question bank, flashcards and a day-by-day study schedule. Every part of the kit can be edited, reordered, extended or regenerated, and the flashcards can be practised inside the app.

- **Live app:** https://interview-prep-kit-three.vercel.app
- **API:** https://interview-prep-kit-wsau.onrender.com
- **Repository:** https://github.com/vinayyamana/interview-prep-kit

> The API runs on Render's free tier, so the first request after a quiet period can take about 50 seconds.

## Features

- **Company research:** crawls the company's own site, then searches public discussion (Hacker News) about how the company interviews.
- **Requirement extraction:** turns the job description into `must` / `nice` requirements with stable ids.
- **Question bank:** technical, behavioural, system-design and company-fit questions, each linked to the requirements it covers.
- **Coverage guarantee:** code checks every must-have requirement has a question, runs up to 2 gap-closing rounds, then adds a deterministic fallback so no must-have is ever left uncovered.
- **Flashcards and practice mode:** Space flips a card, `1` / `2` / `3` rate Hard / OK / Easy, arrow keys move between cards. Cards you felt least sure about come first next session.
- **Study schedule:** exactly the number of days requested (1 to 60), hardest material first, computed by code.
- **Edit and regenerate safely:** edited, pinned and hand-written items are never overwritten when one section is regenerated.
- **Auth:** register, login and logout with server-side sessions; every kit is scoped to its owner.
- **Batch mode:** generate many kits from a JSON file with one command.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (TypeScript), Tailwind CSS, deployed on Vercel |
| Backend | Node.js + Express (JavaScript), deployed on Render |
| Database | MongoDB through Mongoose |
| Scraping | `undici`, `cheerio`, `robots-parser` |
| Validation | `zod` |
| LLM | Google Gemini (free tier) via `@google/genai` |
| Tests | Vitest (32 server tests in 7 files, plus a client test for practice ordering) |

## Getting started

### Prerequisites

- Node.js 20+
- A MongoDB connection string (local or Atlas)
- A Gemini API key

### Install

```bash
git clone https://github.com/vinayyamana/interview-prep-kit.git
cd interview-prep-kit
npm run install:all
```

This runs `npm install` in both `server/` and `client/`.

### Configure

1. Copy `server/.env.example` to `server/.env` and fill in the values from the table below.
2. Create `client/.env.local` with `NEXT_PUBLIC_API_URL` set to the address the server prints when it starts.

### Run

```bash
npm --prefix server start        # API
npm --prefix client run dev      # UI
```

## Environment variables

Secrets live only in environment variables and are never committed.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | server, batch | API key for the LLM provider |
| `GEMINI_MODEL` | server, batch | Gemini model name (read at runtime, so the model can change without touching code) |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret used to sign authentication tokens |
| `SESSION_SECRET` | server | Secret used to sign session cookies |
| `PORT` | server | Port the API listens on (default 5000) |
| `NODE_ENV` | server | Set to `production` on Render: secure cross-site cookies and private-address blocking |
| `LLM_CACHE` | server, batch | Controls the on-disk LLM response cache |
| `EVAL_CONCURRENCY` | batch (optional) | Cases processed in parallel (default 2) |
| `EVAL_CASE_TIMEOUT_MS` | batch (optional) | Per-case timeout (default 170000) |
| `NEXT_PUBLIC_API_URL` | client | Base URL of the API |

## Batch mode

Generate kits without the UI:

```bash
npm --prefix server install
cp server/.env.example server/.env   # add your GEMINI_API_KEY and GEMINI_MODEL
npm run evaluate -- --input edge-cases.json --output kits.json
```

- **Input:** an array of `{ id, jd, company_url, days }`. `edge-cases.json` covers a normal posting, a two-line stub, a company with no hiring page, an unreachable company URL and the same posting submitted twice.
- **Output:** one JSON file `{ version, generated_at, kits: [{ id, status, kit, error }] }`. `status` is `failed` only when no kit could be produced at all.
- **Same pipeline as the website:** both call `assembleKit`, so what is tested in batch is what users get.
- **Resilient:** the output file is rewritten after every case, and one failing case never stops the run.
- **Error codes:** `COMPANY_UNREACHABLE`, `LLM_FAILED`, `LLM_RATE_LIMITED`, `INVALID_KIT`, `CASE_TIMEOUT`, `INVALID_CASE`.

## Tests

```bash
npm --prefix server test
npm --prefix client test
```

Covered: schedule allocation (including 1-day and 60-day schedules), coverage checking, gap closing with a mocked model (rate limits, invented ids), kit structure validation, URL validation, crawl link ranking and practice ordering.

The stack follows the brief's preferred stack, so no substitutions need justifying.

## LLM provider and model

Provider: **Google Gemini** (free tier), through the `@google/genai` SDK. The model name is read from the `GEMINI_MODEL` environment variable (this deployment uses `gemini-3.5-flash-lite`), so the model can change without touching code.

Free tiers limit tokens per minute as well as requests, so the LLM client (`services/llm/client.js`) paces calls, applies a timeout to each call, honours retry-delay hints from rate-limit responses, retries with backoff, and caches responses on disk (`.llm-cache/`) keyed by a hash of model, system prompt and prompt.

## Retrieval approach and sources

Sources used:

1. **The company's own website**, discovered by crawling from the URL the user gives.
2. **Public discussion** about the company's interview process, searched on Hacker News through its public Algolia search API (stories and comments, 20 hits per query). Hits link back to the original `news.ycombinator.com` item. It is a single source, which is stated honestly in the kit when it returns nothing.
3. **The pasted job description** (no retrieval needed).

How the crawl works:

- Every page is validated, fetched with a size and content-type limit, and cleaned to plain text.
- The hiring or about page is never hard-coded. The crawler collects links from the pages it fetches, resolves relative links against the page URL, ranks them by how likely they are to describe the company or how it hires, and fetches the best candidates.
- Requests are rate limited and retried with backoff. A source that cannot be fetched is skipped and reported instead of failing the run.
- `pages_used` in the kit lists only the URLs that were actually used.
- `robots.txt` and site terms are respected.
- Public discussion search is skipped for local addresses. If it finds nothing, the brief says so instead of inventing anything.

## Research and generation sequence

Each step reacts to what the previous one found. The kit is not one prompt that returns everything.

| # | Step | Responsibility |
| --- | --- | --- |
| 1 | Extract requirements | Model proposes, code cleans and assigns ids |
| 2 | Crawl company site | Find and fetch the pages worth reading |
| 3 | Search public discussion | Find how the company actually interviews |
| 4 | Build verified company facts | Values and hiring stages, from fetched text only |
| 5 | Write company brief | From those facts only; honest when facts are missing |
| 6 | Generate questions per category | One model call per category, each with its own instructions |
| 7 | Remove near-duplicates | Word-overlap similarity |
| 8 | Coverage check and second pass | Code finds gaps, model fills them |
| 9 | Flashcards | Generated from the final question set |
| 10 | Schedule | Computed by code |
| 11 | Validate | Kit is checked against the expected structure before saving |

Details that matter:

- The four categories (technical, behavioural, system-design, company-fit) are separate calls, each receiving only the requirements that fit it. "5+ years of React" leads to technical questions, while "mentoring junior engineers" leads to behavioural ones.
- If a hiring process was found (for example a take-home followed by a system design round), it changes what the system-design and company-fit calls ask for. With no company facts, the company-fit call is skipped.
- `priority` is `must` or `nice`, normalised from how the posting words it ("required" is `must`, "bonus points for" or "preferred" is `nice`). `kind` is `technical`, `behavioural` or `domain`.

## Coverage and the second pass

The comparison of requirements against questions is done in code (`checkCoverage`), never by the model. Every question carries `requirement_ids`; ids that do not exist in the kit are dropped.

1. After the first draft, every must-have requirement without a question is a gap.
2. The gap-closing step asks the model for questions only for those requirements, grouped by category, passing the already-asked prompts so it does not repeat itself. The result is merged, deduplicated and checked again.
3. This runs for **at most 2 rounds**. One retry fixes most misses, and a third rarely helps while burning free-tier tokens. The kit reports `coverage.passes`.
4. Any must-have still uncovered gets a deterministic fallback question linked to that requirement, so a kit never ships with uncovered must-haves.
5. If the provider rate-limits during gap closing, the loop stops calling the model, goes straight to the fallback and marks the kit as degraded.

## Generated, edited and pinned state

Every question and flashcard carries two fields:

| Field | Values | Meaning |
| --- | --- | --- |
| `origin` | `generated`, `edited`, `user` | `generated`: produced by the model and untouched. `edited`: generated, then changed by the user. `user`: written by hand |
| `pinned` | `true` / `false` | the user wants it kept in place |

An item is **protected** when `pinned` is true or `origin` is `edited` or `user`. Only untouched, unpinned, generated items are ever replaced by a regeneration. Freshly generated items always start as `origin: "generated"` and `pinned: false`.

When one section is regenerated:

- Only that scope is replaced (the company brief, one question category, flashcards, or the schedule), and every protected item inside it is kept in its current order.
- Items outside the scope are left untouched.
- New generated items that nearly duplicate a kept item are dropped.
- The merge is applied to the **latest saved kit**, not to the copy read before the slow model call, so edits made while a regeneration was running are not overwritten.
- If the model returns nothing, the section is left exactly as it was.
- An edited company brief stays as is unless regeneration is forced.
- Regeneration is refused while a kit is still generating.

The schedule is rebuilt whenever a question is added or deleted, so it never points at a question that no longer exists.

## Schedule allocation

The schedule is a pure function in code with no model call.

- It produces **exactly** the number of days requested, 1 to 60. The API validates the range, and tests cover a 1-day and a 60-day schedule.
- Every must-have requirement appears somewhere in the schedule.
- Higher-priority and harder material is allocated to earlier days, so the hardest topics are not left for the night before.
- Every day has a unique focus label, a list of existing question ids and an integer number of minutes.

## Practice mode

Flashcards are shown one at a time with the answer hidden until revealed. Space flips a card, `1`, `2` and `3` record Hard, OK or Easy, and the arrow keys move between cards. Each rating is saved to the backend. A card with a rating counts as covered, and the rest appear under "Not covered yet". The next session is ordered by confidence, so the cards the user felt least sure about come first.

**Decision:** a confidence-weighted ordering instead of spaced-repetition intervals. The kit is used over a few days before one interview, where simple ordering is easy to explain and predict.

## Generation, failures and double submits

- Creating a kit returns immediately and the pipeline runs in the background. The kit moves through `queued`, `crawling`, `researching`, `generating`, `checking-coverage`, then `done` or `failed`, with a readable progress line that the UI polls and shows.
- A failed kit stores a structured error `{ code, message }` that the UI displays.
- Submitting the same description, company URL and number of days twice returns the existing kit. The input is normalised and hashed, and a unique index per user also protects against two identical requests arriving at the same moment. A failed kit is replaced on retry.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Company URL invalid, 404 or timing out | Retried with backoff, then recorded as a gap. The kit is still produced from the job description, the brief says company information was unavailable, and company-fit questions are skipped |
| No discoverable hiring or about page | Kit is `ok`, company facts are limited to what was found, nothing is invented |
| Two-line job description | Thin kit that states detail was limited; no invented requirements |
| Public discussion finds nothing | Stated honestly in the brief and sources |
| Model returns invalid JSON or an incomplete kit | The call is retried, a fact-based fallback is used where needed, and the kit is validated before saving |
| Provider rate limit or brief failure | Pacing, retry-delay handling, backoff, response cache, and an early switch to the deterministic fallback |
| Same posting submitted twice | Existing kit returned |
| 1-day or 60-day schedule | Allocated exactly, covered by tests |

## Creative feature

No optional creative feature was added. The time went into the builder, regeneration safety and the research pipeline.

## Project structure

```
client/                  Next.js UI: login, kit list, create form, kit builder, practice mode
server/
  index.js               Express entry point
  authRoutes.js          Register, login, logout
  authMiddleware.js      Session guard for protected endpoints
  services/
    assembleKit          Orchestrates the whole pipeline (website and batch both call this)
    retrieval/           crawlSite, fetchPage, cleanText, searchDiscussion
    extract/             Requirement extraction and clean-up
    generate/            Company brief, questions, flashcards, gap closing
    kit/                 Merge of regenerated sections into the saved kit
    coverage/            checkCoverage (pure code)
    schedule/            buildSchedule (pure code)
    security/            validateUrl
    llm/                 Client with pacing, retries and cache
  scripts/evaluate.js    Batch entry point
fixtures/                Local test sites used by the batch fixtures
```

## Deployment

- **Backend:** Render web service, root directory `server`, build command `npm install`, start command `npm start`. Environment variables are set in the Render dashboard.
- **Frontend:** Vercel project, root directory `client`, with `NEXT_PUBLIC_API_URL` pointing at the Render URL.

## Reliability and security

- Every external URL is validated before it is fetched, and again before a re-crawl. Private and loopback addresses are rejected in production.
- `robots.txt` and site terms are respected; pages are fetched with size and content-type limits.
- Page text is treated as data, never as instructions, and the extraction step removes requirements that look injected.
- The LLM client paces calls, applies timeouts, honours retry hints from rate-limit responses, retries with backoff and caches responses on disk.
- Submitting the same description, company URL and days twice returns the existing kit.
- Kits left mid-generation by a server restart are marked failed so they never spin forever.

## Key decisions and trade-offs

- **Code decides what must not be left to the model:** schedule allocation, coverage gaps, id validation, duplicate removal and the guarantee for uncovered must-haves.
- **Honest output over complete-looking output:** a thin posting or an unknown company produces a thin kit or an honest brief.
- **Two gap-closing rounds, then a deterministic fallback:** bounded token spend on a free tier.
- **Edited items win:** a user's work is never discarded by regeneration.
- **Confidence-weighted practice ordering** instead of spaced-repetition intervals, since the kit is used over a few days before one interview.

## Known limitations

- Free hosting means a slow first request after idle, and a free-tier model can still be slow under heavy use.
- Company-fit questions are only as good as the facts found on the company's site.
- Public discussion comes from Hacker News only, so coverage is good for tech companies and thin for others.
- Multiple roles are prepared by creating one kit per role; bulk upload is available through the batch command, not the web form.
- Practice ordering is a confidence-weighted sort, not spaced repetition.
-