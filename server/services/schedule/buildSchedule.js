const MINUTES_PER_QUESTION = { 1: 20, 2: 30, 3: 45 };

const idsOf = (q) => q.requirement_ids || [];

function orderQuestions(questions, requirements) {
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const isMust = (id) => reqById.get(id)?.priority === "must";

  // Group by primary requirement so one day stays on one theme.
  const groups = new Map();
  for (const q of questions) {
    const key = idsOf(q)[0] ?? "_none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const info = [...groups.values()].map((qs) => ({
    qs: [...qs].sort((a, b) => b.difficulty - a.difficulty),
    must: qs.some((q) => idsOf(q).some(isMust)),
    hardest: Math.max(...qs.map((q) => q.difficulty || 0)),
  }));

  // must-have groups first, then harder groups, then bigger groups
  info.sort(
    (a, b) =>
      Number(b.must) - Number(a.must) ||
      b.hardest - a.hardest ||
      b.qs.length - a.qs.length
  );

  return info.flatMap((g) => g.qs);
}

function uniqueLabel(label, used) {
  const n = (used.get(label) || 0) + 1;
  used.set(label, n);
  return n === 1 ? label : `${label} (part ${n})`;
}

function dayFocus(qs, requirements, isReview, used) {
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const counts = new Map();
  for (const q of qs) {
    const primary = idsOf(q)[0];
    if (primary) counts.set(primary, (counts.get(primary) || 0) + 1);
  }

  const top = [...counts.entries()]
    .sort((a, b) => {
      const pa = reqById.get(a[0])?.priority === "must" ? 0 : 1;
      const pb = reqById.get(b[0])?.priority === "must" ? 0 : 1;
      return pa - pb || b[1] - a[1];
    })
    .slice(0, 2)
    .map(([id]) => reqById.get(id)?.topic || reqById.get(id)?.text)
    .filter(Boolean);

  const label = top.join(" + ") || "General practice";
  return uniqueLabel(isReview ? `Review: ${label}` : label, used);
}

function buildSchedule(questions, requirements, daysAvailable) {
  const n = Math.max(1, Math.round(daysAvailable) || 1);
  const ordered = orderQuestions(questions, requirements);
  const chunks = [];

  if (ordered.length >= n) {
    const base = Math.floor(ordered.length / n);
    const extra = ordered.length % n; // earlier days get the extra question
    let i = 0;
    for (let d = 0; d < n; d++) {
      const size = base + (d < extra ? 1 : 0);
      chunks.push({ qs: ordered.slice(i, i + size), review: false });
      i += size;
    }
  } else {
    ordered.forEach((q) => chunks.push({ qs: [q], review: false }));
    for (let d = ordered.length; d < n; d++) {
      const q = ordered.length ? ordered[(d - ordered.length) % ordered.length] : null;
      chunks.push({ qs: q ? [q] : [], review: true });
    }
  }

  const used = new Map();
  const days = chunks.map(({ qs, review }, idx) => ({
    day: idx + 1,
    focus: dayFocus(qs, requirements, review, used),
    question_ids: qs.map((q) => q.id),
    minutes: qs.reduce((s, q) => s + (MINUTES_PER_QUESTION[q.difficulty] || 30), 0),
  }));

  return { days_available: n, days };
}

module.exports = { buildSchedule };