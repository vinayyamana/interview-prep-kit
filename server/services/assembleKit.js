const { extractRequirements } = require("./extract/requirements");
const { crawlSite } = require("./retrieval/crawlSite");
const { searchDiscussion, companyNameFromUrl, isLocalUrl } = require("./retrieval/searchDiscussion");
const { generateQuestions, buildResearch } = require("./generate/questions");
const { closeCoverageGaps } = require("./generate/closeGaps");
const { generateFlashcards } = require("./generate/flashcards");
const { generateCompanyBrief } = require("./generate/companyBrief");
const { buildSchedule, MAX_DAYS } = require("./schedule/buildSchedule");
const { checkCoverage } = require("./coverage/checkCoverage");
const { assertSafeUrl } = require("./security/validateUrl");
const { validateKit } = require("../src/kit/kitSchema");

// ---- error helpers: every thrown error carries a stable `code` (used by evaluate.js) ----
function withCode(err, code) {
  if (err && !/^(LLM_|INVALID_|COMPANY_)/.test(err.code || "")) err.code = code;
  return err;
}

function llmCodeFor(err) {
  return /429|quota|rate.?limit/i.test((err && err.message) || "") ? "LLM_RATE_LIMITED" : "LLM_FAILED";
}

async function llmStep(fn) {
  try {
    return await fn();
  } catch (err) {
    throw withCode(err, llmCodeFor(err));
  }
}

// ---- honest fallbacks (no fabrication) ----
function honestBrief({ companyName, crawlError, pagesUsed, reason }) {
  const BAD_NAME = /^(localhost|nothing|\d+(\.\d+){3})$/i;
  const name = companyName && !BAD_NAME.test(companyName) ? companyName : "this company";
  const why =
    reason ||
    (crawlError
      ? `The company site could not be crawled (${String(crawlError).slice(0, 200)}).`
      : "No usable pages were found on the company site.");
  return {
    summary: `Not enough public information was found about ${name} to write a reliable brief. ${why}`,
    what_they_do: "Not established from the available sources. Check the company site directly before the interview.",
    sources: pagesUsed,
  };
}

// Deterministic flashcards from questions, used only if the model step fails.
function fallbackFlashcards(questions) {
  return questions.slice(0, 12).map((q, i) => ({
    id: `f${i + 1}`,
    front: q.prompt,
    back: q.answer_outline,
    requirement_ids: q.requirement_ids || [],
  }));
}

// company_url may be unreachable; that is reported honestly, never fatal to the whole run.
async function assembleKit({ jd, companyUrl, days, onProgress = () => {} }) {
  const progress = (s) => {
    try {
      onProgress(s);
    } catch (_) {
      /* progress reporting must never break generation */
    }
  };

  // Fail fast, before spending any LLM tokens.
  const daysAvailable = Number(days);
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1 || daysAvailable > MAX_DAYS) {
    const e = new RangeError(`days must be an integer between 1 and ${MAX_DAYS}`);
    e.code = "INVALID_CASE";
    throw e;
  }

  // SSRF guard: an unsafe or unresolvable URL must not stop the kit.
  // We skip crawling, build the kit from the JD, and report it in meta.
  let urlError = null;
  try {
    await assertSafeUrl(companyUrl);
  } catch (err) {
    urlError = err.message;
  }

  progress("crawling");
  const role = await llmStep(() => extractRequirements(jd));

  let crawl = { pages: [], hiringPages: [], skipped: [] };
  let crawlError = urlError;
  if (!urlError) {
    try {
      crawl = await crawlSite(companyUrl);
    } catch (err) {
      crawlError = err.message;
    }
  }

  let companyName = "";
  try {
    companyName = companyNameFromUrl(companyUrl);
  } catch {
    companyName = "";
  }

  progress("researching");
  const discussion = await searchDiscussion(companyName, {
    skip: Boolean(urlError) || isLocalUrl(companyUrl),
  });
  const research = buildResearch(crawl, discussion.results);

  progress("generating");
  const initial = await llmStep(() => generateQuestions({ role, research }));

  progress("checking-coverage");
  const closed = await llmStep(() =>
    closeCoverageGaps({ role, research, questions: initial.questions })
  );

  const questionsWithFlag = closed.questions.map((q) => ({
    ...q,
    origin: q.origin || "generated",
    pinned: false,
    edited: false,
  }));

  let flashcardsRaw;
  let flashcardsError = null;
  try {
    flashcardsRaw = await generateFlashcards(questionsWithFlag);
  } catch (err) {
    flashcardsError = err.message;
    flashcardsRaw = fallbackFlashcards(questionsWithFlag);
  }
  const flashcards = flashcardsRaw.map((f) => ({
    ...f,
    origin: f.origin || "generated",
    pinned: false,
    edited: false,
  }));

  const schedule = buildSchedule(questionsWithFlag, role.requirements, daysAvailable);
  // Final check on the kit as shipped: source of truth for uncovered ids.
  const coverage = checkCoverage(role.requirements, questionsWithFlag);

  const pagesUsed = crawl.pages.map((p) => p.url);
  const discussionResults = discussion.results || [];

  // Company brief: nothing found -> fixed honest brief (no LLM, nothing to fabricate).
  let brief;
  let briefFallback = null;
  if (pagesUsed.length === 0 && discussionResults.length === 0) {
    brief = honestBrief({ companyName, crawlError, pagesUsed });
    briefFallback = "no_sources";
  } else {
    try {
      brief = await generateCompanyBrief({ companyName, crawl, discussionResults });
    } catch (err) {
      brief = honestBrief({
        companyName,
        crawlError,
        pagesUsed,
        reason: "The automatic summary step failed, so only the retrieved sources are listed.",
      });
      briefFallback = `llm_failed: ${err.message}`;
    }
  }

  // Only cite sources we actually retrieved (the model can invent URLs).
  const allowedSources = new Set([...pagesUsed, ...discussionResults.map((r) => r.url).filter(Boolean)]);
  const briefSources = (brief.sources || []).filter((u) => allowedSources.has(u));

  const kit = {
    source: {
      company: companyName || "",
      company_url: companyUrl,
      role: role.title || "",
      location: role.location || "",
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: briefSources,
      edited: false,
    },
    role: {
      title: role.title || "",
      seniority: role.seniority || "",
      responsibilities: role.responsibilities || [],
      requirements: role.requirements,
    },
    questions: questionsWithFlag,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncoveredRequirementIds,
      passes: closed.passes,
      history: closed.history || [], // [{ pass: 1, gaps: ["r4"] }, { pass: 2, gaps: [] }]
    },
    meta: {
      crawl_error: crawlError,
      research_skipped: discussion.note,
      thin_description: role.thin,
      brief_fallback: briefFallback,
      flashcards_error: flashcardsError,
      fallback_questions: closed.fallbackRequirementIds || [],
    },
  };

  // Validate the kit exactly as it will ship.
  const check = validateKit(kit);
  if (!check.ok) {
    const e = new Error("INVALID_KIT: " + check.errors.join("; "));
    e.code = "INVALID_KIT";
    throw e;
  }
  return kit;
}

module.exports = { assembleKit };