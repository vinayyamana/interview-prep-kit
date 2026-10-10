// Pure code: finds must-have requirements with no question covering them.
// Ids that don't exist in `requirements` (model hallucinations like "r99")
// never count as coverage.
function checkCoverage(requirements, questions) {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const validIds = new Set(reqs.map((r) => r.id));

  const covered = new Set(
    (Array.isArray(questions) ? questions : [])
      .flatMap((q) => (Array.isArray(q.requirement_ids) ? q.requirement_ids : []))
      .filter((id) => validIds.has(id))
  );

  const uncoveredRequirementIds = reqs
    .filter((r) => r.priority === "must" && !covered.has(r.id))
    .map((r) => r.id);

  return { uncoveredRequirementIds, covered: [...covered] };
}

module.exports = { checkCoverage };