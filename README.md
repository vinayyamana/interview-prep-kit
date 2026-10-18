# AI Interview Prep Kit

Paste a job description and a company website, say how many days you have, and the app researches the company and builds a personalised interview kit: company brief, role breakdown, categorised question bank, flashcards and a day-by-day study schedule. Everything can be edited, reordered and regenerated, and you can practise against it inside the app.

- Live app: https://interview-prep-kit-three.vercel.app
- API: https://interview-prep-kit-wsau.onrender.com
- Repository: https://github.com/vinayyamana/interview-prep-kit
- Creative feature: **Mock Interview + Weak Spots report** (see below)

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + Tailwind CSS (`client/`) |
| Backend | Node.js + Express (`server/`) |
| Database | MongoDB via Mongoose (Atlas free tier when deployed) |
| Auth | Cookie sessions with `express-session`, stored in MongoDB with `connect-mongo`, passwords hashed with `bcrypt` |
| Language | JavaScript |
| Retrieval | `undici` for fetching, `cheerio` for HTML parsing and cleaning, `robots-parser` for robots.txt |
| Validation | zod |
| Tests | Vitest (8 files, 45 tests) |
| LLM | Google Gemini, model `gemini-2.5-flash` by default (override with `GEMINI_MODEL`), called over REST |

This is the preferred stack, so nothing needs justifying.

## Setup

### Local

    git clone https://github.com/vinayyamana/interview-prep-kit
    cd interview-prep-kit
    npm run install:all

Copy `server/.env.example` to `server/.env` and fill it in. Then run the two apps in separate terminals:

    cd server && npm run dev
    cd client && npm run dev

The client runs on http://localhost:3000 and expects the API at `NEXT_PUBLIC_API_URL` (default `http://localhost:5000`).

### Environment variables

Server (`server/.env`, see `server/.env.example`):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API key (free tier is enough) |
| `GEMINI_MODEL` | Optional, defaults to `gemini-2.5-flash` |
| `MONGO_URI` | MongoDB connection string |
| `SESSION_SECRET` | Signs the session cookie |
| `PORT` | Port the API listens on, 5000 by default |
| `LLM_CACHE` | Set to `0` to turn off the on-disk response cache |
| `LLM_MIN_INTERVAL_MS` | Optional, minimum gap between model calls, default 2000 |

Client:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the API |

The frontend origins allowed by CORS are listed in `allowedOrigins` in `server/index.js` (the Vercel URL and `http://localhost:3000`). Add your own origin there if you host the frontend somewhere else.

### Deployed

- Frontend: Vercel, https://interview-prep-kit-three.vercel.app (root directory `client/`, `NEXT_PUBLIC_API_URL` set to the Render URL).
- Backend: Render, https://interview-prep-kit-wsau.onrender.com (root directory `server/`, all server variables above set in the dashboard). The server trusts Render's proxy so secure session cookies work.

Secrets live only in the hosting dashboards and in local `.env` files, never in the repo. The Render free tier sleeps when idle, so the first request after a pause can take 30 to 50 seconds.

### Batch entry point

From the repository root:

    npm run install:all
    npm run evaluate -- --input <cases.json> --output <kits.json>

The root script forwards to `server/scripts/evaluate.js`. Put `GEMINI_API_KEY` and `MONGO_URI` in `server/.env` first (the batch run loads that file; copy it from `server/.env.example`).

It reads an array of `{ id, jd, company_url, days }`, runs the same `assembleKit` pipeline the web app uses, and writes `{ version, generated_at, kits: [{ id, status, kit, error }] }`. Cases run with limited concurrency, and a case that fails is recorded and the run continues. A case is `failed` only when no kit could be produced at all (for example the model stays unavailable after retries); the error code and message are recorded. A case that could only be partly researched, such as a missing hiring page or an unreachable company site, is still `ok` with the gap recorded in the kit. For example, a case whose `company_url` is unreachable still returns an `ok` kit built from the job description, with the company side marked as not available.

### Tests

    npm test

(runs the Vitest suite in `server/`)

## Architecture

    client/ (Next.js)  --HTTP/cookies-->  server/ (Express)  -->  MongoDB
                                              |
                                              +--> services/retrieval   fetchPage, cleanText, crawlSite, searchDiscussion
                                              +--> services/generate    LLM steps (requirements, brief, questions, flashcards, gap closing, scoring)
                                              +--> services/schedule    deterministic allocation
                                              +--> services/practice    deterministic weak-spot maths
                                              +--> services/security    URL validation
                                              +--> services/llm         throttled, retrying Gemini client

Retrieval, extraction, generation, scheduling and persistence are separate modules. Routes only orchestrate.

## Research and generation sequence

The kit is built in steps that respond to what was found, not by one prompt:

1. **Extract requirements** from the pasted JD. Each gets a stable id, a kind (technical, behavioural, domain) and a priority (must or nice) taken from how the posting words it. A thin JD produces a thin kit, flagged in the UI.
2. **Crawl the company site.** Links are ranked and the promising ones fetched, so the hiring page is found wherever it lives instead of from a fixed path list.
3. **Look for public discussion** of the company's interview process (`searchDiscussion.js`, Hacker News via the Algolia search API).
4. **Company brief** from the crawled pages and verified facts. If nothing could be retrieved the brief says so rather than inventing anything. The model's output is rejected and retried if it copies scraped text or repeats itself.
5. **Questions, one call per category** (technical, behavioural, system-design, company-fit), each with its own prompt and its own eligible requirements. Categories with no fitting requirement are skipped with a reason (for example `NO_MATCHING_REQUIREMENTS`, `NOT_RELEVANT_FOR_ROLE`), and company-fit questions come only from facts found on the company's site, so a company with nothing published gets none (`NO_COMPANY_INFO`).
6. **Flashcards** generated as short recall questions from the questions.
7. **Coverage check (code, not the model).** Every requirement id must have at least one question. Uncovered ones are gaps.
8. **Second pass** (`closeGaps.js`). The first draft is pass 1. Gaps are sent back to the model to generate the missing questions and coverage is checked again, for at most 2 further rounds (3 passes in total). It stops as soon as no gaps remain, or as soon as the model is rate limited. Any gap still open then gets a deterministic fallback question and the kit is flagged as degraded, so a must-have is never left uncovered. Every round is recorded in `coverage.history` and the UI shows it. The cap keeps the run bounded on a free tier where each round costs model calls and tokens; a round that did not close the gap is unlikely to be closed by repeating the same prompt, so the code falls back instead of looping.
9. **Schedule (code, not the model).**
10. **Validate** the kit against a zod schema before saving.

## Retrieval approach and sources

Sources used:

- **The company's own website**, starting from the URL the user gives. Up to 8 pages are fetched per run, within a time budget. Links are followed (relative links included, so local test servers work) and ranked to find about and hiring pages.
- **Hacker News**, through the public Algolia search API (`hn.algolia.com`), for public discussion of the company's interview process. No other third-party site is scraped.

How retrieval behaves:

- **robots.txt is respected.** It is fetched once per origin and cached (capped at 500 KB). A URL it disallows is skipped and reported with the reason `ROBOTS_DISALLOWED`. A missing or unusable robots.txt is treated as no restrictions.
- Only `text/html` responses are processed, and a page larger than 3 MB is rejected.
- A source that cannot be fetched is skipped and recorded, never fatal. Requests are rate limited with backoff.
- The discussion search is skipped for local addresses (a local test server has no real company identity), and if the search is unavailable the kit records that instead of failing.
- Fetched page text and the JD are treated as untrusted data: they are placed inside delimited blocks, the delimiter characters are stripped from scraped text so a page cannot close the block early, and the system prompts say never to follow instructions found in them.

## Generated, edited and pinned state

Questions, flashcards and the company brief carry an `edited` boolean.

- Generated items start with `edited: false`.
- Editing an item inline, or moving a question to another category, sets `edited: true`.
- Items added by hand get an id like `q-user-<random>` and `edited: true`.
- `edited: true` is the pinned state: regeneration never removes or rewrites it. There is no separate "pinned" flag; edited and pinned are the same thing, which keeps the model simple.

**Regenerating one section** (the brief, one question category, flashcards or the schedule):

1. The slow model call runs against a snapshot.
2. The kit is then re-loaded from the database and the merge is applied to the latest data, so edits made while the model was running are not lost.
3. Everything outside the section, plus every edited item inside it, is kept in its original order.
4. New items that nearly repeat a kept item are dropped, using word overlap (overlap coefficient of at least 0.7) over prompt and outline, so a reworded pinned question is not regenerated.
5. If the model returns nothing, or only duplicates, the section is left exactly as it was.
6. A pinned company brief is only replaced when the request sends `force: true`. The brief is regenerated with the same generator as the first draft, and if the site cannot be read at that moment the existing brief is kept.

The UI updates reordering optimistically and rolls back to server state on failure.

## Schedule allocation

Done in code (`services/schedule/buildSchedule.js`), never by the model.

- **Exact day count.** The schedule has exactly the number of days requested, from 1 to 90. The function throws if it ever produces a different number.
- **Ordering.** Questions are grouped by their primary requirement. Groups that cover a must-have come before nice-to-have groups, and harder groups come first. The groups are then dealt round-robin, so every requirement gets its hardest question before any requirement gets its second one. A must-have never waits behind another requirement's whole question set.
- **Time.** Each question costs minutes by difficulty (1 = 20, 2 = 30, 3 = 45). The ordered list is cut into consecutive days aiming at an equal share of the remaining minutes, and every day gets at least one question. Minutes are always integers.
- **Fewer questions than days.** Each question gets its own day, and the remaining days are review days that repeat earlier questions for half the time (minimum 15 minutes).
- **Focus labels.** Each day's focus is built from its categories and requirement topics, and labels are made distinct across days.
- **Must-have coverage.** Every question is scheduled, and the coverage check guarantees every must-have has a question, so every must-have appears in the schedule. `findUnscheduledMustIds` checks this.
- The schedule is rebuilt whenever questions are added, deleted or regenerated, so it never points at a missing question.

## Practice mode

Flashcards step through one at a time with reveal, 1/2/3 confidence ratings (Hard, OK, Easy), keyboard shortcuts, a covered / not covered list, and a "start next session, least confident first" button. I chose a simple confidence-weighted sort over spaced repetition: with a few days to the interview there is no long-term interval to schedule, and "weakest first" is easy to explain. Ratings are saved on the server, with localStorage as a fast fallback.

## Creative feature: Mock Interview + Weak Spots

**Problem:** flashcards test recall, but nothing tests whether you can actually explain an answer, and people do not know which requirements to revise the night before.

- **Mock Interview:** pick a question (or "pick for me"), type your answer, and get a 1 to 5 score, strengths, gaps and feedback judged against the question's answer outline. The answer is passed to the model as untrusted data, the output is validated against a schema (integer 1 to 5), and invalid output is retried. Scores are saved with the kit using the same merge-on-latest-data approach as regeneration.
- **Weak Spots report:** per requirement, mastery is the average of flashcard confidence and mock scores for the questions and cards that cover it. It is calculated entirely in code, with no model involved, and covered by unit tests. Requirements are sorted must before nice, then least mastered first. Anything below 60% is "weak". The report also builds a short last-night revision list of the weakest questions and the cards you have not rated Easy.

## Edge cases and failure handling

- **Invalid, 404 or timed-out company URL:** the site is recorded as unreachable, the kit is still built from the JD, and the UI shows the gap. A batch case is only `failed` when no kit can be produced at all.
- **No hiring or about page:** the kit says so, and no company-fit questions are invented.
- **Two-line JD:** few requirements are extracted and the kit is marked thin.
- **No public discussion found:** reported honestly, nothing fabricated.
- **Invalid model JSON or incomplete kit:** retried, then validated against the schema before saving.
- **Rate limits and provider errors:** calls are serialised and throttled, 429 and 5xx are retried with exponential backoff and jitter (honouring `Retry-After`), and the coverage loop has a deterministic fallback.
- **Same JD, company and days submitted twice:** a hash of the normalised input with a unique index per user returns the existing kit instead of generating again.
- **Slow generation:** creation returns 202 straight away, the pipeline runs in the background, and the UI polls every 2 seconds and shows the current step. Kits left half-finished by a server restart are marked failed on startup.
- **1-day and 60-day schedules:** both are supported by the allocator (limit is 1 to 90 days).

## Security

- Passwords are hashed with bcrypt (10 rounds) and never stored in plain text.
- Sessions are server-side (stored in MongoDB), the cookie is secure behind Render's proxy, and CORS only allows the listed frontend origins with credentials.
- Kits are scoped to the logged-in user; every kit route checks ownership, and signed-out requests get 401.
- External URLs are validated before fetching (`assertSafeUrl`), fetched through a safe agent, and private and loopback addresses are rejected in production.
- Only `text/html` is processed, pages over 3 MB are rejected, and robots.txt is read with a 500 KB cap.
- Fetched text and the JD are never treated as instructions.

## Known limitations

- Public discussion comes from Hacker News only, so many companies will return nothing there, and the kit says so.
- At most 8 pages are crawled per company, so a hiring page buried deeper can be missed.
- Reordering uses up/down arrows, not drag and drop.
- Mock interview scoring is a model judgement against an outline, so scores are indicative, not exact.
- Weak-spot thresholds and weights are simple heuristics, not tuned on real data.
- Free-tier hosting means cold starts and Gemini free-tier token limits, so generation can be slow under load.