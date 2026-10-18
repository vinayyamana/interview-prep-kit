// Deterministic weak-spot calculation. No model involved.
// Combines flashcard confidence (1-3) and mock-interview scores (1-5) per requirement.

const WEAK_BELOW = 0.6; // mastery under this counts as weak
const REVISION_LIMIT = 10;

const confidenceToUnit = (c) => (c - 1) / 2; // 1->0, 2->0.5, 3->1
const scoreToUnit = (s) => (s - 1) / 4; // 1->0, 5->1

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeWeakSpots(data) {
  const requirements = data?.role?.requirements || [];
  const questions = data?.questions || [];
  const flashcards = data?.flashcards || [];
  const practice = data?.practice || {};
  const mock = data?.mock || {};

  const signals = new Map(requirements.map((r) => [r.id, []]));

  for (const card of flashcards) {
    const c = practice[card.id];
    if (![1, 2, 3].includes(c)) continue;
    for (const rid of card.requirement_ids || []) {
      signals.get(rid)?.push(confidenceToUnit(c));
    }
  }

  for (const q of questions) {
    const m = mock[q.id];
    if (!m || !Number.isInteger(m.score)) continue;
    for (const rid of q.requirement_ids || []) {
      signals.get(rid)?.push(scoreToUnit(m.score));
    }
  }

  const items = requirements.map((r) => {
    const s = signals.get(r.id) || [];
    const mastery = s.length ? average(s) : null;
    const status = mastery === null ? "not_practised" : mastery < WEAK_BELOW ? "weak" : "strong";
    return {
      requirement_id: r.id,
      text: r.text,
      kind: r.kind,
      priority: r.priority,
      mastery: mastery === null ? null : Math.round(mastery * 100) / 100,
      status,
      signals: s.length,
    };
  });

  // must before nice; then least mastered first (not practised counts as lowest)
  const rank = (i) => (i.mastery === null ? -1 : i.mastery);
  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "must" ? -1 : 1;
    return rank(a) - rank(b);
  });

  const weak = items.filter((i) => i.status !== "strong");
  const weakRank = new Map(weak.map((i) => [i.requirement_id, rank(i)]));

  // revision list: questions/flashcards touching weak requirements, weakest first
  const worstFor = (ids) => Math.min(...(ids || []).filter((id) => weakRank.has(id)).map((id) => weakRank.get(id)));
  const touchesWeak = (ids) => (ids || []).some((id) => weakRank.has(id));

  const revisionQuestions = questions
    .filter((q) => touchesWeak(q.requirement_ids))
    .sort((a, b) => worstFor(a.requirement_ids) - worstFor(b.requirement_ids) || (b.difficulty || 0) - (a.difficulty || 0))
    .slice(0, REVISION_LIMIT)
    .map((q) => q.id);

  const revisionFlashcards = flashcards
    .filter((f) => touchesWeak(f.requirement_ids) && (practice[f.id] === undefined || practice[f.id] === 1))
    .sort((a, b) => worstFor(a.requirement_ids) - worstFor(b.requirement_ids))
    .slice(0, REVISION_LIMIT)
    .map((f) => f.id);

  return {
    summary: {
      requirements: items.length,
      weak: items.filter((i) => i.status === "weak").length,
      not_practised: items.filter((i) => i.status === "not_practised").length,
      strong: items.filter((i) => i.status === "strong").length,
      mock_answers: Object.keys(mock).length,
    },
    items,
    revision: { question_ids: revisionQuestions, flashcard_ids: revisionFlashcards },
  };
}

module.exports = { computeWeakSpots, WEAK_BELOW };