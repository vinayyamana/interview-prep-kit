# AI Interview Prep Kit

Turns a job description + company URL into a prep kit (brief, requirements, questions, flashcards, schedule, practice mode).

## Stack
Next.js + Tailwind (client/), Node + Express (server/), MongoDB Atlas, Gemini ([model name]).

## Live
- App: https://interview-prep-api-fawn.vercel.app
- API: [Render URL]

## Setup
cd server && npm install && cp .env.example .env
Batch: npm run evaluate -- --input cases.json --output kits.json
Env: MONGO_URI, SESSION_SECRET, CLIENT_URL, GEMINI_API_KEY, GEMINI_MODEL

## Pipeline
extract requirements -> crawl site (ranked links, robots.txt) -> public discussion search -> questions per category -> coverage check (code) -> gap-closing (max 2 passes) -> flashcards -> schedule (code) -> kit validation (zod).

## Key decisions
- Coverage and schedule are plain code, not LLM.
- 2 gap passes: one retry fixes most misses; a third burns free-tier tokens.
- Edited/pinned state: each item has an `edited` flag; regenerating a category keeps edited items.
- LLM client: pacing, honors retry-after, exponential backoff, JSON retry.
- Thin JD gives a thin kit; no site info gives an honest brief.

## Known limitations
Free Render sleeps (first request ~50s). [add yours]