const MINUTES_PER_QUESTION = { 1: 20, 2: 30, 3: 45 };
const DEFAULT_MINUTES = 30;
const REVIEW_FACTOR = 0.5; // repeat (review) questions take half the time
const MIN_REVIEW_MINUTES = 15;
const MAX_DAYS = 90;

const idsOf = (q) => q.requirement_ids || [];
const cost = (q) => MINUTES_PER_QUESTION[q.difficulty] || DEFAULT_MINUTES;

function validateDays(daysAvailable) {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1 || daysAvailable > MAX_DAYS) {
    throw new RangeError(`days must be an integer between 1 and ${MAX_DAYS}`);
  }
  return daysAvailable;
}

// Round-robin across groups: first question of every group, then the second of every group, ...
function roundRobin(groups) {
  const out = [];
  const longest = Math.max(0, ...groups.map((g) => g.qs.length));
  for (let round = 0; round < longest; round++) {
    for (const g of groups) {
      if (g.qs[round]) out.push(g.qs[round]);
    }
  }
  return out;
}

// Ordering rules:
//  1. must-have material before nice-to-have material
//  2. inside each of those, every requirement gets its hardest question first
//     (so a must-have never waits behind another requirement's whole question set)
//  3. harder groups before easier ones
function orderQuestions(questions, requirements) {
  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const isMust = (id) => reqById.get(id)?.priority === "must";

  // Group by primary requirement.
  const groups = new Map();
  for (const q of questions) {
    const key = idsOf(q)[0] ?? "_none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  const info = [...groups.values()].map((qs) => ({
    qs: [...qs].sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0)),
    must: qs.some((q) => idsOf(q).some(isMust)),
    hardest: Math.max(...qs.map((q) => q.difficulty || 0)),
  }));

  info.sort(
    (a, b) =>
      Number(b.must) - Number(a.must) ||
      b.hardest - a.hardest ||
      b.qs.length - a.qs.length
  );

  return [
    ...roundRobin(info.filter((g) => g.must)),
    ...roundRobin(info.filter((g) => !g.must)),
  ];
}

function shorten(text, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function requirementLabel(req) {
  if (!req) return null;
  return req.topic || (req.text ? shorten(req.text) : null);
}

// Label for one (requirement, category) group of questions inside a day.
function groupLabel(category, req) {
  const base = requirementLabel(req);
  if (category === "company-fit") return "Company fit";
  if (category === "system-design") return base ? `System design: ${base}` : "System design";
  if (category === "behavioural") return base ? `Behavioural: ${base}` : "Behavioural";
  return base;
}

function dayFocus(qs, requirements, isReview) {
  if (qs.length === 0) return "No questions available yet";

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const byCategory = new Map();
  for (const q of qs) {
    const label = requirementLabel(reqById.get(idsOf(q)[0]));
    const list = byCategory.get(q.category) || [];
    if (label && !list.includes(label)) list.push(label);
    byCategory.set(q.category, list);
  }

  const parts = [...byCategory.entries()]
    .map(([cat, labels]) => {
      if (cat === "company-fit") return "Company fit";
      const prefix =
        cat === "system-design" ? "System design" :
        cat === "behavioural" ? "Behavioural" : null;
      const names = labels.slice(0, 2).join(", ");
      if (!prefix) return names;
      return names ? `${prefix}: ${names}` : prefix;
    })
    .filter(Boolean);

  const label = parts.slice(0, 2).join(" + ") || "General practice";
  return isReview ? `Review: ${label}` : label;
}

// Make sure no two days share a focus label.
// 1st choice: add a short snippet of the day's first question. Last resort: "(part n)".
function makeLabelsDistinct(days, questions) {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const counts = new Map();
  for (const d of days) counts.set(d.focus, (counts.get(d.focus) || 0) + 1);

  for (const d of days) {
    if (counts.get(d.focus) > 1) {
      const first = qById.get(d.question_ids[0]);
    }
  }

  const used = new Map();
  for (const d of days) {
    const n = (used.get(d.focus) || 0) + 1;
    used.set(d.focus, n);
    if (n > 1) d.focus = `${d.focus} (part ${n})`;
  }
  return days;
}

// Split ordered questions into n consecutive days with similar total minutes.
// Every day is guaranteed at least one question (requires ordered.length >= n).
function chunkByMinutes(ordered, n) {
  const chunks = [];
  let remaining = ordered.reduce((s, q) => s + cost(q), 0);
  let current = [];
  let acc = 0;

  ordered.forEach((q, i) => {
    current.push(q);
    acc += cost(q);
    const daysLeft = n - chunks.length - 1;
    const questionsLeft = ordered.length - i - 1;
    const target = remaining / (daysLeft + 1);
    const mustClose = questionsLeft === daysLeft; // keep 1 question per remaining day
    if (daysLeft > 0 && (acc >= target || mustClose)) {
      chunks.push({ qs: current, review: false });
      remaining -= acc;
      current = [];
      acc = 0;
    }
  });
  chunks.push({ qs: current, review: false });
  return chunks;
}

function buildSchedule(questions, requirements, daysAvailable) {
  const n = validateDays(daysAvailable);
  const ordered = orderQuestions(questions, requirements);
  let chunks = [];

  if (ordered.length >= n) {
    chunks = chunkByMinutes(ordered, n);
  } else {
    // Fewer questions than days: one new question per day, then review days.
    ordered.forEach((q) => chunks.push({ qs: [q], review: false }));
    for (let d = ordered.length; d < n; d++) {
      const q = ordered.length ? ordered[(d - ordered.length) % ordered.length] : null;
      chunks.push({ qs: q ? [q] : [], review: true });
    }
  }

  const days = chunks.map(({ qs, review }, idx) => {
    const raw = qs.reduce((s, q) => s + cost(q), 0);
    const minutes = review && qs.length
      ? Math.max(MIN_REVIEW_MINUTES, Math.round(raw * REVIEW_FACTOR))
      : raw;
    return {
      day: idx + 1,
      focus: dayFocus(qs, requirements, review),
      question_ids: qs.map((q) => q.id),
      minutes,
    };
  });

  return { days_available: n, days: makeLabelsDistinct(days, questions) };
}

// Must-have requirement ids that no scheduled question covers.
function findUnscheduledMustIds(schedule, questions, requirements) {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const covered = new Set();
  for (const day of schedule.days) {
    for (const id of day.question_ids) {
      for (const rid of idsOf(qById.get(id) || {})) covered.add(rid);
    }
  }
  return requirements
    .filter((r) => r.priority === "must" && !covered.has(r.id))
    .map((r) => r.id);
}

module.exports = { buildSchedule, findUnscheduledMustIds, MAX_DAYS };