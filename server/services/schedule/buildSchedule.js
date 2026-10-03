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
    qs: [...qs].sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0)),
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

function shorten(text, max = 60) {
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function dayFocus(qs, requirements, isReview, used) {
  if (qs.length === 0) return uniqueLabel("No questions available yet", used);

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
    .map(([id]) => {
      const r = reqById.get(id);
      return r?.topic || (r?.text ? shorten(r.text) : null);
    })
    .filter(Boolean);

  const label = top.join(" + ") || "General practice";
  return uniqueLabel(isReview ? `Review: ${label}` : label, used);
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

  const used = new Map();
  const days = chunks.map(({ qs, review }, idx) => {
    const raw = qs.reduce((s, q) => s + cost(q), 0);
    const minutes = review && qs.length
      ? Math.max(MIN_REVIEW_MINUTES, Math.round(raw * REVIEW_FACTOR))
      : raw;
    return {
      day: idx + 1,
      focus: dayFocus(qs, requirements, review, used),
      question_ids: qs.map((q) => q.id),
      minutes,
    };
  });

  return { days_available: n, days };
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