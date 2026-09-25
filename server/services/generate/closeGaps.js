const { checkCoverage } = require("../coverage/checkCoverage");
const { generateForCategory } = require("./questions");

const MAX_PASSES = 2;

function categoryFor(requirement) {
  if (requirement.kind === "behavioural") return "behavioural";
  return "technical";
}

async function closeCoverageGaps({ role, research, questions }) {
  let all = [...questions];
  let passes = 0;

  for (; passes < MAX_PASSES; passes++) {
    const { uncoveredRequirementIds } = checkCoverage(role.requirements, all);
    if (!uncoveredRequirementIds.length) break;

    const gaps = role.requirements.filter((r) => uncoveredRequirementIds.includes(r.id));
    const byCategory = {};
    for (const r of gaps) (byCategory[categoryFor(r)] ??= []).push(r);

    for (const [category, reqs] of Object.entries(byCategory)) {
      try {
        const fresh = await generateForCategory(category, role, reqs, research);
        all.push(...fresh);
      } catch (err) {
        if (/429|quota/i.test(err.message || "")) throw err;
        // A category that fails to close stays reported as a gap, not a fatal error.
      }
    }
  }

  const nextId = all.length + 1;
  all = all.map((q, i) => (q.id ? q : { id: `q${nextId + i}`, ...q }));
  const final = checkCoverage(role.requirements, all);
  return { questions: all, uncoveredRequirementIds: final.uncoveredRequirementIds, passes: passes + 1 };
}

module.exports = { closeCoverageGaps };