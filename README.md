# AI Interview Prep Kit

Turns a job description and a company URL into an interview prep kit: company brief, role breakdown, questions, flashcards and a day-by-day schedule.

**Live app (login → generate kit):** https://interview-prep-kit-three.vercel.app

**Sample generated kit:** https://interview-prep-api-fawn.vercel.app/kits/6ac39096f0a3680f23ab9660

**API:** https://interview-prep-api-fawn.vercel.app

## Stack

Next.js + Tailwind, Node.js + Express, MongoDB, LLM: Gemini

## Setup

```bash
npm install --prefix server
npm install --prefix client
```

Copy `.env.example` to `server/.env` and fill in the keys.

## Batch command

```bash
npm run evaluate -- --input cases.json --output kits.json
```

## Pipeline

1. Extract requirements (must/nice, stable ids) from the JD
2. Crawl the company site, rank links, fetch about/hiring pages
3. Search public discussion of the interview process
4. Generate questions per category with separate calls
5. Coverage check in code, gap-fill for uncovered requirements, re-check
6. Schedule built in code, not by the model

## Schedule

Exactly N days. Must-have and hardest material first; spare days become review days.

## Edited state

Each question is generated, edited or manual. Regenerating a category replaces only generated questions, so edits and hand-added questions survive.

## Sources and safety

Pages from the company URL the user gives. robots.txt respected. Private and loopback addresses rejected. Fetched text is treated as data, never as instructions.

## Edge cases

Invalid or unreachable URL: kit still produced with an honest brief. Thin JD: thin kit. LLM rate limits: retry with backoff.

## Limitations

Interview stages on a different subdomain (for example the GitLab handbook) are not crawled, so hiring stages can be empty.
