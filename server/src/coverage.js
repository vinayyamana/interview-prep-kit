export function findUncovered(requirements, questions) {
  const covered = new Set(questions.flatMap(q => q.requirement_ids));
  return requirements.filter(r => !covered.has(r.id));
}