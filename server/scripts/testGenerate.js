require("dotenv").config();
const { extractRequirements } = require("../services/extract/requirements");
const { crawlSite } = require("../services/retrieval/crawlSite");
const { generateQuestions, buildResearch } = require("../services/generate/questions");

const jd = `Senior Backend Engineer
Required: 5+ years with Node.js, strong MongoDB experience.
You will mentor junior engineers.
Bonus points for Kubernetes experience.`;

(async () => {
  const role = await extractRequirements(jd);
  const crawl = await crawlSite("https://posthog.com");
  const research = buildResearch(crawl, []);
  const out = await generateQuestions({ role, research });
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => console.error("FAILED:", e.message));