import { describe, it, expect } from "vitest";
import { orderCards, coveredCount, Ratings } from "./practice";

const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("orderCards", () => {
  it("puts unrated first, then Hard, OK, Easy", () => {
    const ratings: Ratings = { a: 3, b: 1, c: 2 };
    const ids = orderCards(cards, ratings).map((c) => c.id);
    expect(ids).toEqual(["d", "b", "c", "a"]);
  });

  it("does not mutate the original array", () => {
    orderCards(cards, { a: 3 });
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("coveredCount", () => {
  it("counts only rated cards", () => {
    expect(coveredCount(cards, { a: 1, c: 3 })).toBe(2);
  });
});