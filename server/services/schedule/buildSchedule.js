const MINUTES_PER_QUESTION = { 1: 20, 2: 30, 3: 45 };

// Higher-priority, higher-difficulty material is ordered first, so it lands on earlier days.
function orderQuestions(questions, requirements) {
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const priorityRank = (q) => (q.requirement_ids.some((id) => reqById.get(id)?.priority === "must") ? 0 : 1);
  return [...questions].sort((a, b) => priorityRank(a) - priorityRank(b) || b.difficulty - a.difficulty);
}

function buildSchedule(questions, requirements, daysAvailable) {
  const days = Math.max(1, Math.round(daysAvailable) || 1);
  const ordered = orderQuestions(questions, requirements);
  const buckets = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    focus: "",
    question_ids: [],
    minutes: 0,
  }));

  // Round-robin keeps load roughly even while preserving the priority order.
  ordered.forEach((q, i) => {
    const bucket = buckets[i % days];
    bucket.question_ids.push(q.id);
    bucket.minutes += MINUTES_PER_QUESTION[q.difficulty] || 30;
  });

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const qById = new Map(questions.map((q) => [q.id, q]));
  for (const bucket of buckets) {
    const cats = new Set(
      bucket.question_ids.map((id) => qById.get(id)?.category).filter(Boolean)
    );
    bucket.focus = [...cats].join(" + ") || "Review";
  }

  return { days_available: days, days: buckets };
}

module.exports = { buildSchedule };