const { extractRequirements } = require("./extract/requirements");
const { crawlSite } = require("./retrieval/crawlSite");
const { searchDiscussion, companyNameFromUrl, isLocalUrl } = require("./retrieval/searchDiscussion");
const { generateQuestions, buildResearch } = require("./generate/questions");
const { closeCoverageGaps } = require("./generate/closeGaps");
const { buildFlashcards } = require("./generate/flashcards");
const { buildSchedule } = require("./schedule/buildSchedule");
const { checkCoverage } = require("./coverage/checkCoverage");

// company_url may be unreachable; that is reported honestly, never fatal to the whole run.
async function assembleKit({ jd, companyUrl, days }) {
  const role = await extractRequirements(jd);

  let crawl = { pages: [], hiringPages: [], skipped: [] };
  let crawlError = null;
  try {
    crawl = await crawlSite(companyUrl);
  } catch (err) {
    crawlError = err.message;
  }

  const companyName = companyNameFromUrl(companyUrl);
  const discussion = await searchDiscussion(companyName, { skip: isLocalUrl(companyUrl) });
  const research = buildResearch(crawl, discussion.results);

  const initial = await generateQuestions({ role, research });
  const closed = await closeCoverageGaps({ role, research, questions: initial.questions });
  const flashcards = buildFlashcards(closed.questions);
  const schedule = buildSchedule(closed.questions, role.requirements, days);
  const coverage = checkCoverage(role.requirements, closed.questions);

  const home = crawl.pages[0];
  const pagesUsed = crawl.pages.map((p) => p.url);

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
      summary: home ? home.text.slice(0, 300) : "",
      what_they_do: home ? home.text.slice(0, 600) : "",
      sources: pagesUsed,
    },
    role: {
      title: role.title || "",
      seniority: role.seniority || "",
      responsibilities: role.responsibilities || [],
      requirements: role.requirements,
    },
    questions: closed.questions,
    flashcards,
    schedule,
    coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes: closed.passes },
    meta: {
      crawl_error: crawlError,
      research_skipped: discussion.note,
      thin_description: role.thin,
    },
  };
}

module.exports = { assembleKit };