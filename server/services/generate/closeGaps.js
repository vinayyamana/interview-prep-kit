const { checkCoverage } = require("../coverage/checkCoverage");
const { generateForCategory } = require("./questions");

// Gap-closing rounds after the first draft. The draft is pass 1.
// 2 rounds: one retry fixes most misses, a third rarely helps and burns free-tier tokens.
// If gaps still remain after that, a deterministic fallback question is created from the
// requirement text itself, so a must-have never ships uncovered.
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

// Deterministic last resort: a plain question built from the requirement text.
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

        // Drop model-supplied ids (they collide with existing ones) and any hallucinated
        // requirement ids. If the model gave no valid link and only one requirement was
        // targeted, that requirement is the only possible target.
        const cleaned = fresh.map(({ id, ...rest }) => {
          const ids = (rest.requirement_ids || []).filter((x) => validIds.has(x));
          return {
            ...rest,
            requirement_ids: ids.length ? ids : reqs.length === 1 ? [reqs[0].id] : [],
          };
        });

        all.push(...cleaned);
        all = assignIds(all);
      } catch (err) {
        if (/429|quota|rate.?limit/i.test(err.message || "")) {
          if (!err.code) err.code = "LLM_RATE_LIMITED";
          throw err;
        }
        console.warn(`[closeGaps] ${category} generation failed: ${err.message}`);
        // A category that fails to close stays a gap for now; the fallback below handles it.
      }
    }

    gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
    history.push({ pass: rounds + 1, gaps });
  }

  // Deterministic fallback for anything the model could not cover.
  const fallbackRequirementIds = [];
  if (gaps.length > 0) {
    const gapReqs = role.requirements.filter((r) => gaps.includes(r.id));
    all.push(...gapReqs.map(fallbackQuestion));
    all = assignIds(all);
    fallbackRequirementIds.push(...gaps);
    gaps = checkCoverage(role.requirements, all).uncoveredRequirementIds;
  }

  return {
    questions: assignIds(all),
    uncoveredRequirementIds: gaps,
    passes: rounds + 1,
    history,
    fallbackRequirementIds,
  };
}

module.exports = { closeCoverageGaps };