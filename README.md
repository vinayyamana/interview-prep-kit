# Interview Prep Kit

Paste a job description, give the company website and the number of days you have, and the app researches the company and builds an interview prep kit: company brief, role breakdown, categorised question bank, flashcards and a day-by-day schedule. You can reshape every part of it and practise against the flashcards inside the app.

- Live app: https://interview-prep-kit-three.vercel.app
- API: https://interview-prep-kit-wsau.onrender.com
- Repository: https://github.com/vinayyamana/interview-prep-kit

The walkthrough video is submitted through the Trao careers page together with this repository and the deployment link.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (TypeScript), deployed on Vercel |
| Backend | Node.js + Express (JavaScript), deployed on Render (free tier) |
| Database | MongoDB through Mongoose |
| LLM | Google Gemini, free tier |
| Tests | Vitest, 32 tests in 7 files |

The Gemini model name is read from the `GEMINI_MODEL` environment variable, so the model can be changed without touching code. Free tiers limit tokens per minute as well as requests, so the LLM client paces calls, applies a timeout, honours retry-delay hints from rate-limit responses, retries with backoff and caches responses on disk (`.llm-cache/`) keyed by a hash of model, system prompt and prompt.

## Setup

### Local

```bash
npm --prefix server install
npm --prefix client install
```

1. Copy `server/.env.example` to `server/.env` and fill in the values below.
2. Create `client/.env.local` with `NEXT_PUBLIC_API_URL` set to the address the server prints when it starts.
3. Start the API with `npm --prefix server start` and the UI with `npm --prefix client run dev`.

### Batch entry point

From a clean clone:

```bash
npm --prefix server install
cp server/.env.example server/.env   # then add your own GEMINI_API_KEY, GEMINI_MODEL and secrets
npm run evaluate -- --input edge-cases.json --output kits.json
```

- Input: an array of `{ id, jd, company_url, days }`. `edge-cases.json` is included and covers a normal posting, a two-line stub, a company with no hiring page, an unreachable company URL and the same posting submitted twice.
- Output: one JSON file `{ version, generated_at, kits: [{ id, status, kit, error }] }`. `status` is `failed` only when no kit could be produced at all. A missing hiring page, empty public discussion or a thin posting is still `ok`, with the gap recorded in the kit.
- It runs the same `assembleKit` pipeline the website uses. Cases run with a concurrency of 2, the output file is rewritten after every case so a crash keeps earlier results, and one failing case never stops the run. Five cases completed in about 163 seconds on the free tier.
- Relative input and output paths resolve from the folder the command is run in. Company URLs may be local addresses; links are followed relative to the page they were found on, so no host is assumed.
- Error codes: `COMPANY_UNREACHABLE`, `LLM_FAILED`, `LLM_RATE_LIMITED`, `INVALID_KIT`, `CASE_TIMEOUT`, `INVALID_CASE`.

### Tests

```bash
npm --prefix server test
```

Covered: schedule allocation (including 1-day and 60-day schedules and ordering), coverage checking, gap closing with a mocked model (including rate limits and invented ids), kit structure validation, URL validation and crawl link ranking.

### Deployed

- Backend: a Render web service with root directory `server`, build command `npm install` and start command `npm start`. Environment variables are set in the Render dashboard and are never committed.
- Frontend: a Vercel project with root directory `client`, with `NEXT_PUBLIC_API_URL` pointing at the Render URL above.
- Free-tier note: Render sleeps after inactivity, so the first request after a quiet period can take about 50 seconds.

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | server, batch | API key for the LLM provider |
| `GEMINI_MODEL` | server, batch | Gemini model name |
| `MONGO_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret used to sign authentication tokens |
| `SESSION_SECRET` | server | Secret used to sign session cookies |
| `LLM_CACHE` | server, batch | Controls the on-disk LLM response cache |
| `EVAL_CONCURRENCY` | batch (optional) | Cases processed in parallel, default 2 |
| `EVAL_CASE_TIMEOUT_MS` | batch (optional) | Per-case timeout, default 170000 |
| `NEXT_PUBLIC_API_URL` | client | Base URL of the API |

## Architecture

```
client/                    Next.js UI: login, kit list, create form, kit builder, practice mode
server/
  routes/kitRoutes.js      HTTP layer: auth guard, validation, ownership checks, builder endpoints
  models/Kit.js            Persistence: kit document, status, progress, input hash
  services/
    assembleKit            Orchestrates the whole pipeline (website and batch both call this)
    retrieval/             crawlSite, fetchPage, cleanText, searchDiscussion
    extract/               requirement extraction and clean-up
    generate/              company brief and facts, questions per category, flashcards, gap closing
    coverage/              checkCoverage (pure code)
    schedule/              buildSchedule (pure code)
    security/              validateUrl
    llm/                   client with pacing, retries and cache
  scripts/evaluate.js      Batch entry point
  tests/                   Vitest suites
```

Retrieval, extraction, generation, scheduling and persistence are separate modules. The batch script and the web routes share the same pipeline code, not a parallel implementation.

## Retrieval approach and sources

Sources used:

1. The company's own website, discovered by crawling from the URL the user gives.
2. Public discussion about the company's interview process, returned by the `searchDiscussion` service.
3. The pasted job description (no retrieval needed).

How the crawl works:

- Every page is validated, fetched with a size and content-type limit, and cleaned to plain text.
- The hiring or about page is never hard-coded. The crawler collects links from the pages it fetches, resolves relative links against the page URL, ranks them by how likely they are to describe the company or how it hires, and fetches the best candidates.
- Requests are rate limited and retried with backoff. A source that cannot be fetched is skipped and reported instead of failing the run.
- `robots.txt` and site terms are respected, and `pages_used` in the kit lists only the URLs that were actually used.
- Public discussion search is skipped for local addresses. If it finds nothing, the brief says so instead of inventing anything.

## Research and generation sequence

Each step reacts to what the previous one found. It is not one prompt that returns everything.

1. **Extract requirements** from the job description. The model proposes them; deterministic code then removes duplicates, drops invented or injected items, normalises `must` or `nice` from how the posting words it, caps the list and assigns stable ids (`r1`, `r2`, ...). A two-line posting produces a short list and a kit that says detail was limited.
2. **Crawl the company site**, rank links, fetch the best pages.
3. **Search public discussion** about how the company interviews.
4. **Build verified company facts** (values, hiring stages) from fetched text only. Page text is treated as data to read, never as instructions.
5. **Write the company brief** from those facts. With no usable facts the brief is honest about that rather than fabricated.
6. **Generate questions with a separate model call per category** (technical, behavioural, system-design, company-fit), each with its own instructions and the requirements that fit it. If a hiring process was found (for example a take-home followed by a system design round), it changes what the system-design and company-fit calls ask for. With no company facts the company-fit call is skipped.
7. **Remove near-duplicate questions** using word-overlap similarity, keeping a question that is the only one covering a requirement.
8. **Coverage check and second pass** (below).
9. **Flashcards** are generated from the final question set.
10. **Schedule** is computed by code (below).
11. **Validate the kit** against the expected structure before saving.

## Coverage and the second pass

The comparison of requirements against questions is done in code (`checkCoverage`), never by the model. Every question carries `requirement_ids`; ids that do not exist in the kit are dropped.

1. After the first draft, every must-have requirement without a question is a gap.
2. The gap-closing step asks the model for questions only for those requirements, grouped by category, passing the already-asked prompts so it does not repeat itself. The result is merged, deduplicated and checked again.
3. This runs for at most 2 rounds. One retry fixes most misses, and a third rarely helps while burning free-tier tokens. The kit reports `coverage.passes`.
4. Any must-have still uncovered gets a deterministic fallback question linked to that requirement, so a kit never ships with uncovered must-haves. The fallback ids are recorded in the kit metadata.
5. If the provider rate-limits during gap closing, the loop stops calling the model, goes straight to the fallback and marks the kit as degraded.

## Generated, edited and pinned state

Every question and flashcard carries state flags: where it came from (`origin`, generated or user-written), whether the user changed it (`edited`) and `pinned`. Editing a question, answer outline or category through the API sets `edited`. A question added by hand is created as edited from the start.

When one section is regenerated:

- Only that scope is replaced (the company brief, one question category, flashcards, or the schedule).
- Items outside the scope, and every edited or hand-written item inside it, are kept in their current order.
- New generated items that nearly duplicate a kept item (for example a reworded copy of an edited question) are dropped.
- The merge is applied to the latest saved kit, not to the copy read before the slow model call, so edits made while a regeneration was running are not overwritten.
- If the model returns nothing, the section is left exactly as it was.
- An edited company brief stays as is unless regeneration is forced.
- Regeneration is refused while a kit is still generating.

The schedule is rebuilt whenever a question is added or deleted, so it never points at a question that no longer exists.

## Schedule allocation

The schedule is a pure function in code with no model call.

- It produces exactly the number of days requested, 1 to 60. The API validates the range and tests cover a 1-day and a 60-day schedule.
- Every must-have requirement appears somewhere in the schedule.
- Higher-priority and harder material is allocated to earlier days, so the hardest topics are not left for the night before.
- Every day has a focus label (labels are unique across days), a list of existing question ids and an integer number of minutes.

## Practice mode

Flashcards are shown one at a time with the answer hidden until revealed. Space flips a card, `1`, `2` and `3` record Hard, OK or Easy, and the arrow keys move between cards. Each rating is saved to the backend. A card with a rating counts as covered; the rest appear under "Not covered yet". The next session is ordered by confidence so the cards the user felt least sure about come first. I chose a confidence-weighted ordering over spaced-repetition intervals because the kit is used over a few days before one interview, where simple ordering is easy to explain and predict.

## Generation, failures and double submits

- Creating a kit returns immediately and the pipeline runs in the background. The kit moves through `queued`, `crawling`, `researching`, `generating`, `checking-coverage`, then `done` or `failed`, with a readable progress line the UI polls and shows.
- A failed kit stores a structured error `{ code, message }` that the UI displays.
- On server start, kits left mid-generation by a restart are marked failed so they never spin forever.
- Submitting the same description, company URL and number of days twice returns the existing kit. The input is normalised and hashed, and a unique index per user also protects against two identical requests arriving at the same moment. A failed kit is replaced on retry. The batch command applies the same rule, including when duplicate cases run in parallel.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Company URL invalid, 404 or timing out | Retried with backoff, then recorded as a gap. The kit is still produced from the job description, the brief says company information was unavailable, and company-fit questions are skipped |
| No discoverable hiring or about page | Kit is `ok`, company facts are limited to what was found, nothing is invented |
| Two-line job description | Thin kit that states detail was limited; no invented requirements |
| Public discussion finds nothing | Stated honestly in the brief and sources |
| Model returns invalid JSON or an incomplete kit | The call is retried, a fact-based fallback is used where needed, and the kit is validated before saving |
| Provider rate limit or brief failure | Pacing, retry-delay handling, backoff, response cache, and early switch to the deterministic fallback |
| Same posting submitted twice | Existing kit returned |
| 1-day or 60-day schedule | Allocated exactly, covered by tests |

## Security

- Every external URL is validated before it is fetched, including again before a re-crawl. Private and loopback addresses are rejected in production; local addresses are allowed only so the batch fixtures can be served locally.
- Fetched content is restricted to expected content types and a maximum size.
- Text from the job description and from crawled pages is passed to the model as data. The extraction step also removes requirements that look injected.
- Registration, login and logout use server-side sessions. Protected endpoints return 401 when signed out, and every kit lookup is scoped to the signed-in user so one user cannot read or change another user's kits.
- Secrets live only in environment variables and are not committed.

## Key decisions and trade-offs

- **Code decides what must not be left to the model:** schedule allocation, coverage gaps, id validation, duplicate removal and the final guarantee for uncovered must-haves.
- **Honest output over complete-looking output:** a thin posting or an unknown company produces a thin kit or an honest brief.
- **Two gap-closing rounds, then a deterministic fallback:** bounded token spend on a free tier, with the coverage guarantee still holding.
- **Edited items win:** a user's work is never discarded by regeneration, even if that leaves a category with fewer fresh questions.
- **One pipeline for website and batch** so what is tested in batch is what users get.

## Known limitations

- Free hosting means a slow first request after idle, and a free-tier model can still be slow under heavy use.
- Company-fit questions are only as good as the facts found on the company's site; many sites publish little about hiring.
- Public discussion coverage depends on what the search returns for a given company.
- Responsibilities written as plain duties in a posting are treated as must-have unless the posting words them as optional.
- Practice ordering is a confidence-weighted sort, not spaced repetition with intervals.
-