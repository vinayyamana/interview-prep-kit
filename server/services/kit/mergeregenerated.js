// Each question/flashcard carries:
//   origin: "generated" | "edited" | "user"
//   pinned: boolean
// Only untouched, unpinned, generated items in the regenerated category are replaced.
function isProtected(item) {
  return item.pinned === true || item.origin === "edited" || item.origin === "user";
}

function nextId(prefix, existing) {
  let max = 0;
  for (const item of existing) {
    const n = Number(String(item.id).replace(prefix, ""));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

// oldQuestions: all current questions
// category: the category being regenerated
// newGenerated: freshly generated questions for that category (ids ignored, reassigned here)
function mergeRegeneratedQuestions(oldQuestions, category, newGenerated) {
  const kept = oldQuestions.filter((q) => q.category !== category || isProtected(q));

  let counter = nextId("q", oldQuestions);
  const fresh = newGenerated.map((q) => ({
    ...q,
    id: `q${++counter}`,
    category,
    origin: "generated",
    pinned: false,
  }));

  return [...kept, ...fresh];
}

// Ids of removed questions that the schedule may still reference
function removedQuestionIds(oldQuestions, mergedQuestions) {
  const alive = new Set(mergedQuestions.map((q) => q.id));
  return oldQuestions.filter((q) => !alive.has(q.id)).map((q) => q.id);
}

module.exports = { mergeRegeneratedQuestions, removedQuestionIds, isProtected };