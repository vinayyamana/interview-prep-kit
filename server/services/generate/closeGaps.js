const { checkCoverage } = require("../coverage/checkCoverage");
const { generateForCategory } = require("./questions");

// Gap-closing rounds after the first draft. The draft is pass 1.
// 2 rounds: one retry fixes most misses, a third rarely helps and burns free-tier tokens.
const MAX_PASSES = 2;

function categoryFor(requirement) {
  if (requirement.kind === "behavioural") return "behavioural";
  return "technical";
}

// New questions get ids continuing after the highest existing id.
function assignIds(list) {
  let max = list.reduce((m, q) => {
    const n = Number(String(q.id || "").replace(/^q/, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return list.map((q) => (q.id ? q : { ...q, id: `q${++max}` }));
}

async function closeCoverageGaps({ role, research, questions }) {
  let all = [...questions];
  const history = [];

  let gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
  history.push({ pass: 1, gaps });

  let rounds = 0;
  while (gaps.length > 0 && rounds < MAX_PASSES) {
    rounds++;

    const gapReqs = role.requirements.filter((r) => gaps.includes(r.id));
    const byCategory = {};
    for (const r of gapReqs) (byCategory[categoryFor(r)] ??= []).push(r);

    for (const [category, reqs] of Object.entries(byCategory)) {
      try {
        const alreadyAsked = all.map((q) => q.prompt).slice(-12);
        const fresh = await generateForCategory(category, role, reqs, research, alreadyAsked);
        all.push(...fresh);
        all = assignIds(all);
      } catch (err) {
        if (/429|quota/i.test(err.message || "")) throw err;
        console.warn('[closeGaps] ${category} generation failed: ${err.message}');
        // A category that fails to close stays reported as a gap, not a fatal error.
      }
    }

    gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
    history.push({ pass: rounds + 1, gaps });
  }

  return {
    questions: assignIds(all),
    uncoveredRequirementIds: gaps,
    passes: rounds + 1,
    history,
  };
}

module.exports = { closeCoverageGaps };