const { checkCoverage } = require("../coverage/checkCoverage");
const { generateForCategory } = require("./questions");

// Gap-closing rounds after the first draft (the draft is pass 1).
// 2 rounds: one retry fixes most misses, a third rarely helps and burns free-tier tokens.
// Anything still uncovered gets a deterministic fallback question, so a must-have never ships uncovered.
const MAX_PASSES = 2;

const isRateLimit = (err) => /429|quota|rate.?limit/i.test(err?.message || "");

function categoryFor(requirement) {
  return requirement.kind === "behavioural" ? "behavioural" : "technical";
}

function assignIds(list) {
  let max = list.reduce((m, q) => {
    const n = Number(String(q.id || "").replace(/^q/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return list.map((q) => (q.id ? q : { ...q, id: `q${++max}` }));
}

function fallbackQuestion(req) {
  const category = categoryFor(req);
  const prompt =
    category === "behavioural"
      ? `Describe a specific situation that shows this: ${req.text}`
      : `Walk me through your hands-on experience with: ${req.text}`;
  return {
    requirement_ids: [req.id],
    category,
    prompt,
    answer_outline:
      "Give one concrete example: the context, what you did, the trade-offs you weighed, and the result.",
    difficulty: 2,
    origin: "generated",
    pinned: false,
  };
}

async function closeCoverageGaps({ role, research, questions }) {
  let all = [...questions];
  const history = [];
  const validIds = new Set(role.requirements.map((r) => r.id));
  let rateLimited = false;

  let gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
  history.push({ pass: 1, gaps });

  let rounds = 0;
  while (gaps.length > 0 && rounds < MAX_PASSES && !rateLimited) {
    rounds++;

    const gapReqs = role.requirements.filter((r) => gaps.includes(r.id));
    const byCategory = {};
    for (const r of gapReqs) (byCategory[categoryFor(r)] ??= []).push(r);

    for (const [category, reqs] of Object.entries(byCategory)) {
      try {
        const alreadyAsked = all.map((q) => q.prompt).slice(-12);
        const fresh = await generateForCategory(category, role, reqs, research, alreadyAsked);

        const cleaned = fresh
          .map(({ id, ...rest }) => {
            const ids = (rest.requirement_ids || []).filter((x) => validIds.has(x));
            return {
              ...rest,
              requirement_ids: ids.length ? ids : reqs.length === 1 ? [reqs[0].id] : [],
            };
          })
          // A question linked to no requirement can never close a gap.
          .filter((q) => q.requirement_ids.length > 0);

        all.push(...cleaned);
        all = assignIds(all);
      } catch (err) {
        if (isRateLimit(err)) {
          // Don't throw away a finished draft: stop calling the model, let the fallback close the gaps.
          rateLimited = true;
          console.warn("[closeGaps] rate limited, switching to deterministic fallback");
          break;
        }
        console.warn(`[closeGaps] ${category} generation failed: ${err.message}`);
      }
    }

    gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
    history.push({ pass: rounds + 1, gaps });
  }

  const fallbackRequirementIds = [];
  if (gaps.length > 0) {
    const gapReqs = role.requirements.filter((r) => gaps.includes(r.id));
    all.push(...gapReqs.map(fallbackQuestion));
    all = assignIds(all);
    fallbackRequirementIds.push(...gaps);
    gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
    history.push({ pass: "fallback", gaps });
  }

  return {
    questions: assignIds(all),
    uncoveredRequirementIds: gaps,
    passes: rounds + 1,
    history,
    fallbackRequirementIds,
    degraded: rateLimited,
  };
}

module.exports = { closeCoverageGaps };