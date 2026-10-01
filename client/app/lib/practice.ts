export type Confidence = 1 | 2 | 3; // 1 Hard, 2 OK, 3 Easy
export type Ratings = Record<string, Confidence | undefined>;

// Unrated first, then Hard, OK, Easy
export function orderCards<T extends { id: string }>(cards: T[], ratings: Ratings): T[] {
  return [...cards].sort((a, b) => (ratings[a.id] ?? 0) - (ratings[b.id] ?? 0));
}

export function coveredCount(cards: { id: string }[], ratings: Ratings): number {
  return cards.filter((c) => ratings[c.id]).length;
}