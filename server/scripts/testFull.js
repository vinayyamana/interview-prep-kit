require("dotenv").config();
const { extractRequirements } = require("../services/extract/requirements");
const { crawlSite } = require("../services/retrieval/crawlSite");
const { generateQuestions, buildResearch } = require("../services/generate/questions");
const { closeCoverageGaps } = require("../services/generate/closeGaps");
const { buildSchedule } = require("../services/schedule/buildSchedule");

const jd = `Senior Backend Engineer
Required: 5+ years with Node.js, strong MongoDB experience.
You will mentor junior engineers.
Bonus points for Kubernetes experience.`;

(async () => {
  const role = await extractRequirements(jd);
  const crawl = await crawlSite("https://posthog.com");
  const research = buildResearch(crawl, []);
  const initial = await generateQuestions({ role, research });
  const closed = await closeCoverageGaps({ role, research, questions: initial.questions });
  const schedule = buildSchedule(closed.questions, role.requirements, 5);

  console.log("UNCOVERED:", closed.uncoveredRequirementIds);
  console.log("PASSES:", closed.passes);
  console.log("SCHEDULE:", JSON.stringify(schedule, null, 2));
})().catch((e) => console.error("FAILED:", e.message));