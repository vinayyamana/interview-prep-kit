# AI Interview Prep Kit

Turns a job description and a company URL into an interview prep kit: company brief, role breakdown, categorised question bank, flashcards, and a day-by-day study schedule. The kit is editable, and you can practise against it in the app.

**Live app:** https://interview-prep-kit-three.vercel.app
**API:** https://interview-prep-api-fawn.vercel.app

## Stack

Next.js + Tailwind CSS (client), Node.js + Express (server), MongoDB, Google Gemini (LLM). All preferred-stack choices, so nothing to justify.

## LLM

Provider: Google Gemini (free tier). Model: `[PASTE GEMINI_MODEL FROM .env]`.
Responses can be cached (`LLM_CACHE`), and calls retry with backoff when the provider rate-limits.

## Setup

```bash
npm install --prefix server
npm install --prefix client
```

Copy `server/.env.example` to `server/.env` and fill in the values.

| Variable | Purpose |
|---|---|
| GEMINI_API_KEY | Gemini API access |
| GEMINI_MODEL | Gemini model name |
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | Signs session tokens |
| PORT | API port (default 5000) |
| LLM_CACHE | Caches LLM responses |

Run locally:

```bash
npm run dev --prefix server
npm run dev --prefix client
```

Deployed: backend on Render, frontend on Vercel. Environment variables are set in each dashboard, never committed.

## Batch command

```bash
npm run evaluate --prefix server -- --input <cases.json> --output <kits.json>
```

If you run it from inside `server/`, use `npm run evaluate -- --input <cases.json> --output <kits.json>`.

It reads an array of `{ id, jd, company_url, days }`, runs the same pipeline as the web app, and writes `{ version, generated_at, kits: [...] }`. A case that fails is recorded and the run continues. The file may start with a UTF-8 BOM, which is stripped.

## Architecture

`client/` (Next.js) talks to `server/` (Express). The server keeps concerns separate under `server/services/`:

- `retrieval/`: fetch, clean, crawl, discussion search
- `extract/`: requirement extraction
- `generate/`: company brief, facts, questions, flashcards, gap closing
- `schedule/`: schedule allocation
- `coverage/`: coverage check
- `security/`: URL validation

`assembleKit.js` orchestrates the pipeline. The web app and the batch command call the same function, and every kit is validated against the schema (`kitSchema.js`) before it is saved.

## Retrieval approach and sources

- The crawl starts at the company URL, respects robots.txt, and rate-limits requests.
- Links are scored by keywords (interview, hiring, careers, jobs, join) and the best-scoring ones are fetched, up to a page limit. There is no fixed path list, and relative links are followed on any host.
- Hiring pages are identified from the crawled pages, and hiring stages are extracted only if their words actually appear in the fetched text.
- Public discussion of the company's interview process is searched separately.
- Pages that fail are skipped and recorded, never fatal.
- Sources used: the company's own website, public search results for interview discussion.

## Pipeline

1. **Extract** requirements from the JD (stable ids, `must` or `nice`, kind).
2. **Crawl** the company site and find hiring pages.
3. **Search** public discussion of the interview process.
4. **Company brief** and company facts from the fetched text only.
5. **Generate questions per category** (technical, behavioural, system-design, company-fit) in separate calls with separate instructions. Hiring-stage facts change what gets generated.
6. **Coverage check in code**: any requirement id with no question is a gap.
7. **Close gaps**: generate the missing questions, then check again.
8. **Flashcards** for the questions.
9. **Schedule** built in code, not by the model.
10. **Validate** against the kit schema, then save.

Coverage and scheduling are deterministic code on purpose. The model never decides what is covered or how days are split.

## Coverage passes

The first draft is pass 1. If must-have gaps remain, up to 2 more gap-closing rounds run (`MAX_PASSES = 2`). It stops as soon as nothing is uncovered. Two rounds is enough in practice, and it caps LLM usage under free-tier limits. Anything still uncovered is reported in `coverage.uncovered_requirement_ids` instead of being hidden.

## Schedule allocation

The schedule has exactly N days (as requested). Questions are ordered by `must` before `nice`, then by difficulty (high first), and distributed across the days, so hard and high-priority material lands early. Minutes are integers derived from difficulty. Every must-have requirement appears somewhere in the schedule, and every `question_ids` entry refers to an existing question. Covered by tests (`schedule.test.js`, `scheduleOrdering.test.js`), including 1-day and long schedules.

## Generated, edited and pinned state

Every question, flashcard, and the company brief carries an `edited` flag.

- Generated items are saved with `edited: false`.
- Any manual change (edit, add by hand, reorder) sets `edited: true`. An edited item is treated as pinned.

`POST /api/kits/:id/regenerate` regenerates one section only (company brief, one question category, flashcards, or schedule):

- **Questions:** the new list is everything outside the regenerated category, plus every edited question, plus fresh generated ones. Edited questions are never dropped.
- **No repeats:** pinned prompts (up to 8) are passed to the generator as "already asked". Fresh questions that duplicate a kept one are filtered out in code, and new ids are allocated so existing ids stay stable.
- **Company brief:** if the brief was edited, regenerate returns the user's version unchanged unless the client sends `force: true`.
- Other sections are untouched, so edits made elsewhere survive.

## Practice mode

Flashcards are shown one at a time with the answer revealed on flip. The user rates each card Hard / OK / Easy (keys 1/2/3, arrows to move). The app shows what is covered and what is not. The next session is ordered by confidence-weighted sort, least confident first. This is simple and predictable, and it works for a few days of prep, where full spaced-repetition intervals would add little.

## Edge cases

- **Invalid URL, 404, or timeout:** recorded as a research gap. The kit is still built from the JD with an honest brief ("no readable pages could be retrieved"). Status stays `ok`, because a kit was produced.
- **No hiring page:** no hiring-process questions are invented, and the brief says so.
- **Two-line JD:** a thin kit with `thin_description: true`. No requirements are invented, and questions are skipped (`NO_MATCHING_REQUIREMENTS`).
- **No public discussion found:** the brief says so instead of fabricating one.
- **Invalid LLM JSON or incomplete kit:** retried, and schema validation rejects anything incomplete before it is saved.
- **Rate limits or provider failures:** backoff and retry.
- **1-day and 60-day schedules:** the allocator handles both, with tests.
- **Same JD and company submitted twice:** see known limitations.

## Security

- External URLs are validated before fetching, including every redirect. Private, reserved, and loopback addresses are rejected.
- Only expected content types and sizes are handled.
- The JD and every fetched page are untrusted text. All prompts state that this text is source material only and that instructions inside it must never be followed.
- Passwords are hashed, sessions use signed tokens, and users can only read and modify their own kits.

## Tests

```bash
npm test --prefix server
```

Covers schedule allocation and ordering, coverage checking, kit structure validation, and URL validation.

## Key decisions and trade-offs

- Coverage checking and schedule allocation live in code, not in the model, so results are checkable and repeatable.
- An unreachable company is a research gap, not a failure. A kit built from the JD alone is still useful, and `failed` is reserved for cases where no kit can be produced.
- An `edited` flag on each item is the simplest model that makes regeneration safe for user work.
- Inventing nothing: thin input gives a thin kit that says so.

## Known limitations

- Free-tier rate limits make generation slow for large batches.
- Public discussion search depends on what the search source returns.
- Submitting the same JD and company twice creates two separate kits.
- Question quality depends on how much the JD and the company site contain.