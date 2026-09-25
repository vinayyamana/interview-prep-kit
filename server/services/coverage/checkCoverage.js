// Pure code: finds must-have requirements with no question covering them.
function checkCoverage(requirements, questions) {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  const uncoveredRequirementIds = requirements
    .filter((r) => r.priority === "must" && !covered.has(r.id))
    .map((r) => r.id);
  return { uncoveredRequirementIds, covered: [...covered] };
}

module.exports = { checkCoverage };