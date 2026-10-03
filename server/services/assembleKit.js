const { extractRequirements } = require("./extract/requirements");
const { crawlSite } = require("./retrieval/crawlSite");
const { searchDiscussion, companyNameFromUrl, isLocalUrl } = require("./retrieval/searchDiscussion");
const { generateQuestions, buildResearch } = require("./generate/questions");
const { closeCoverageGaps } = require("./generate/closeGaps");
const { generateFlashcards } = require("./generate/flashcards");
const { generateCompanyBrief } = require("./generate/companyBrief");
const { buildSchedule } = require("./schedule/buildSchedule");
const { checkCoverage } = require("./coverage/checkCoverage");
const { assertSafeUrl } = require("./security/validateUrl");

// company_url may be unreachable; that is reported honestly, never fatal to the whole run.
async function assembleKit({ jd, companyUrl, days }) {
  // SSRF guard: an unsafe or unresolvable URL must not stop the kit.
  // We skip crawling, build the kit from the JD, and report it in meta.
  let urlError = null;
  try {
    await assertSafeUrl(companyUrl);
  } catch (err) {
    urlError = err.message;
  }

  const role = await extractRequirements(jd);

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

  const discussion = await searchDiscussion(companyName, {
    skip: Boolean(urlError) || isLocalUrl(companyUrl),
  });
  const research = buildResearch(crawl, discussion.results);

  const initial = await generateQuestions({ role, research });
  const closed = await closeCoverageGaps({ role, research, questions: initial.questions });

  const questionsWithFlag = closed.questions.map((q) => ({ ...q, edited: false }));

  const flashcards = (await generateFlashcards(questionsWithFlag)).map((f) => ({
    ...f,
    edited: false,
  }));

  const schedule = buildSchedule(questionsWithFlag, role.requirements, days);
  // Final check on the kit as shipped: source of truth for uncovered ids.
  const coverage = checkCoverage(role.requirements, questionsWithFlag);

  const pagesUsed = crawl.pages.map((p) => p.url);

  const brief = await generateCompanyBrief({
    companyName,
    crawl,
    discussionResults: discussion.results,
  });

  return {
    source: {
      company: companyName || "",
      company_url: companyUrl,
      role: role.title || "",
      location: role.location || "",
      jd_chars: role.jd_chars,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: brief.sources,
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
    },
  };
}

module.exports = { assembleKit };