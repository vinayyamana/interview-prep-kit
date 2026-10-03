require("dotenv").config();
const assert = require("assert");
const { extractRequirements } = require("../services/extract/requirements");
const { crawlSite } = require("../services/retrieval/crawlSite");
const { generateQuestions, buildResearch } = require("../services/generate/questions");
const { closeCoverageGaps } = require("../services/generate/closeGaps");
const { buildSchedule, findUnscheduledMustIds } = require("../services/schedule/buildSchedule");

const NORMAL_JD = `Senior Backend Engineer
Required: 5+ years with Node.js, strong MongoDB experience.
You will mentor junior engineers.
Bonus points for Kubernetes experience.`;

const CASES = {
  normal: { url: "https://posthog.com", jd: NORMAL_JD },
  thin: {
    url: "https://posthog.com",
    jd: `Backend Developer
We need someone good with APIs.`,
  },
  nohiring: { url: "https://example.com", jd: NORMAL_JD },
  unreachable: { url: "https://thisdoesnotexist.invalid", jd: NORMAL_JD },
};

(async () => {
  const name = process.argv[2] || "normal"; // node scripts/testFull.js thin
  const selected = CASES[name];
  if (!selected) {
    console.log(`Unknown case "${name}". Use one of: ${Object.keys(CASES).join(", ")}`);
    return;
  }
  const { jd, url } = selected;
  console.log(`CASE: ${name}`);

  const role = await extractRequirements(jd);
  console.log(
    "REQUIREMENTS:",
    role.requirements.map((r) => `${r.id} [${r.priority}/${r.kind}] ${r.text}`)
  );
  console.log("THIN:", role.thin);

  let crawl;
  try {
    crawl = await crawlSite(url);
  } catch (e) {
    console.log("CRAWL FAILED, continuing without company pages:", e.message);
    crawl = { pages: [], hiringPages: [], skipped: [{ url, reason: e.message }] };
  }
  console.log(
    "PAGES:", crawl.pages.length,
    "| HIRING PAGES:", crawl.hiringPages,
    "| SKIPPED:", crawl.skipped.length
  );

  const research = buildResearch(crawl, []);
  const initial = await generateQuestions({ role, research });
  console.log("CATEGORIES:", [...new Set(initial.questions.map((q) => q.category))]);
  console.log(
  "COMPANY-FIT:",
  initial.questions.filter((q) => q.category === "company-fit").map((q) => q.prompt)
);


  let questions = initial.questions;

  // Force a gap on the first must requirement (only if there is one)
  const target = role.requirements.find((r) => r.priority === "must");
  if (target) {
    questions = initial.questions.filter((q) => !q.requirement_ids.includes(target.id));
    console.log(`Forced gap on ${target.id}: ${initial.questions.length} -> ${questions.length} questions`);
  } else {
    console.log("No must requirement found, skipping forced gap");
  }

  const closed = await closeCoverageGaps({ role, research, questions });
  console.log("UNCOVERED:", closed.uncoveredRequirementIds, "PASSES:", closed.passes);
  assert.deepStrictEqual(closed.uncoveredRequirementIds, [], "must requirements still uncovered");
  if (target) assert.ok(closed.passes >= 2, "gap should have needed a second pass");

  for (const days of [1, 5, 60]) {
    const s = buildSchedule(closed.questions, role.requirements, days);
    const mins = s.days.map((d) => d.minutes);
    assert.strictEqual(s.days.length, days);
    assert.ok(mins.every(Number.isInteger));
    assert.deepStrictEqual(findUnscheduledMustIds(s, closed.questions, role.requirements), []);
    console.log(`${days}-day OK, minutes:`, days <= 10 ? mins : `${Math.min(...mins)}..${Math.max(...mins)}`);
  }
  console.log("ALL CHECKS PASSED");
})().catch((e) => console.error("FAILED:", e.message));