# AI Interview Prep Kit

Turns a job description + company URL into an interview prep kit:
company brief, role breakdown, questions, flashcards, study schedule.

**Live:** <frontend-url> | **API:** <backend-url>

## Stack
Next.js + Tailwind, Node.js + Express, MongoDB, Gemini (<model name>).

## Setup
npm install --prefix server
npm install --prefix client
Copy .env.example to server/.env and fill in the keys.

## Batch command
npm run evaluate -- --input cases.json --output kits.json

## Pipeline
1. Extract requirements (must/nice, stable ids) from the JD
2. Crawl the company site, rank links, fetch hiring/about pages
3. Search public discussion of the interview process
4. Generate questions per category (separate calls per category)
5. Coverage check in code; uncovered requirements get a gap-fill pass
6. Schedule built in code, not by the model

## Coverage passes
First draft, then a code-side check. Any requirement without a
question triggers a gap-fill generation, then it is re-checked.

## Schedule
Must-have and hardest first, exactly N days. Spare days become review days.

## Edited / manual state
Each question is generated, edited, or manual. Regenerating a category
replaces only generated ones, so edits and hand-added questions survive.

## Sources and safety
Company about/careers pages from the URL given. robots.txt respected.
Private and loopback addresses rejected. Fetched text is treated as data.

## Edge cases
Invalid URL or no pages: kit still produced with an honest brief.
Thin JD: thin kit. LLM rate limits: retry with backoff.

## Known limitations
Interview stages hosted on a different subdomain (e.g. GitLab handbook)
are not crawled, so hiring stages may be empty.