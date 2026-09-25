// Derives flashcards from existing questions instead of a separate LLM call.
function buildFlashcards(questions) {
  return questions
    .filter((q) => q.category === "technical" || q.category === "domain")
    .map((q, i) => ({
      id: `f${i + 1}`,
      front: q.prompt,
      back: q.answer_outline,
      requirement_ids: q.requirement_ids,
    }));
}

module.exports = { buildFlashcards };