export function findUncovered(requirements, questions) {
  const valid = new Set((requirements || []).map((r) => r.id));
  const covered = new Set();
  for (const q of questions || []) {
    for (const id of q.requirement_ids || []) {
      if (valid.has(id)) covered.add(id);
    }
  }
  return (requirements || []).filter((r) => !covered.has(r.id));
}

// Only must-have gaps block a kit from shipping.
export function findUncoveredMust(requirements, questions) {
  return findUncovered(requirements, questions).filter((r) => r.priority === "must");
}

// One entry per pass, so the UI can show "Pass 1: 2 gaps, Pass 2: closed".
export function recordPass(history, passNumber, gapIds) {
  return [...(history || []), { pass: passNumber, gaps: gapIds }];
}