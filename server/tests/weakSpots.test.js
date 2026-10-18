import { describe, it, expect } from "vitest";
import { computeWeakSpots, WEAK_BELOW } from "../services/practice/weakSpots.js";

const req = (id, priority = "must") => ({ id, text: `Requirement ${id}`, kind: "technical", priority });
const q = (id, requirement_ids, difficulty = 2) => ({ id, requirement_ids, difficulty, category: "technical" });
const f = (id, requirement_ids) => ({ id, requirement_ids, front: "", back: "" });

const byId = (result, id) => result.items.find((i) => i.requirement_id === id);

describe("computeWeakSpots", () => {
  describe("mastery calculation", () => {
    it("maps flashcard confidence 1/2/3 to 0 / 0.5 / 1", () => {
      for (const [rating, expected] of [[1, 0], [2, 0.5], [3, 1]]) {
        const data = {
          role: { requirements: [req("r1")] },
          flashcards: [f("f1", ["r1"])],
          practice: { f1: rating },
        };
        expect(byId(computeWeakSpots(data), "r1").mastery).toBeCloseTo(expected);
      }
    });

    it("maps mock score 1/3/5 to 0 / 0.5 / 1", () => {
      for (const [score, expected] of [[1, 0], [3, 0.5], [5, 1]]) {
        const data = {
          role: { requirements: [req("r1")] },
          questions: [q("q1", ["r1"])],
          mock: { q1: { score } },
        };
        expect(byId(computeWeakSpots(data), "r1").mastery).toBeCloseTo(expected);
      }
    });

    it("averages flashcard and mock signals for the same requirement", () => {
      const data = {
        role: { requirements: [req("r1")] },
        flashcards: [f("f1", ["r1"])],
        questions: [q("q1", ["r1"])],
        practice: { f1: 3 }, // 1.0
        mock: { q1: { score: 1 } }, // 0.0
      };
      const item = byId(computeWeakSpots(data), "r1");
      expect(item.mastery).toBeCloseTo(0.5);
      expect(item.signals).toBe(2);
    });

    it("credits one flashcard to every requirement it covers", () => {
      const data = {
        role: { requirements: [req("r1"), req("r2")] },
        flashcards: [f("f1", ["r1", "r2"])],
        practice: { f1: 3 },
      };
      const result = computeWeakSpots(data);
      expect(byId(result, "r1").mastery).toBe(1);
      expect(byId(result, "r2").mastery).toBe(1);
    });
  });

  describe("status", () => {
    it("is not_practised with null mastery when there is no signal", () => {
      const data = { role: { requirements: [req("r1")] }, flashcards: [f("f1", ["r1"])], practice: {} };
      const item = byId(computeWeakSpots(data), "r1");
      expect(item.status).toBe("not_practised");
      expect(item.mastery).toBeNull();
      expect(item.signals).toBe(0);
    });

    it("is weak below the threshold and strong at or above it", () => {
      expect(WEAK_BELOW).toBe(0.6);
      const weak = {
        role: { requirements: [req("r1")] },
        flashcards: [f("f1", ["r1"])],
        practice: { f1: 2 }, // 0.5
      };
      expect(byId(computeWeakSpots(weak), "r1").status).toBe("weak");

      const strong = {
        role: { requirements: [req("r1")] },
        flashcards: [f("f1", ["r1"]), f("f2", ["r1"])],
        practice: { f1: 3, f2: 2 }, // 0.75
      };
      expect(byId(computeWeakSpots(strong), "r1").status).toBe("strong");
    });
  });

  describe("full kit scenario", () => {
    const data = {
      role: { requirements: [req("r1"), req("r2"), req("r3", "nice"), req("r4")] },
      questions: [q("q1", ["r1"]), q("q2", ["r2"], 1), q("q3", ["r3"]), q("q4", ["r1", "r2"], 3)],
      flashcards: [f("f1", ["r1"]), f("f2", ["r2"])],
      practice: { f1: 3, f2: 1 },
      mock: { q2: { score: 1 } },
    };
    const result = computeWeakSpots(data);

    it("counts each status in the summary", () => {
      expect(result.summary).toEqual({
        requirements: 4,
        weak: 1, // r2
        not_practised: 2, // r3, r4
        strong: 1, // r1
        mock_answers: 1,
      });
    });

    it("sorts must before nice, then least mastered first (unpractised lowest)", () => {
      expect(result.items.map((i) => i.requirement_id)).toEqual(["r4", "r2", "r1", "r3"]);
    });

    it("builds a revision list from weak requirements only, weakest and hardest first", () => {
      // q3 (r3 unpractised) first, then q4 and q2 (both r2); q4 is harder so it goes before q2
      expect(result.revision.question_ids).toEqual(["q3", "q4", "q2"]);
      expect(result.revision.flashcard_ids).toEqual(["f2"]);
    });
  });

  describe("revision flashcards", () => {
    it("leaves out cards rated Easy even when their requirement is weak", () => {
      const data = {
        role: { requirements: [req("r1")] },
        flashcards: [f("f1", ["r1"]), f("f2", ["r1"])],
        practice: { f1: 3, f2: 1 }, // average 0.5 -> weak
      };
      const result = computeWeakSpots(data);
      expect(byId(result, "r1").status).toBe("weak");
      expect(result.revision.flashcard_ids).toEqual(["f2"]);
    });

    it("includes unrated cards of a weak requirement", () => {
      const data = {
        role: { requirements: [req("r1")] },
        flashcards: [f("f1", ["r1"])],
        practice: {},
      };
      expect(computeWeakSpots(data).revision.flashcard_ids).toEqual(["f1"]);
    });
  });

  describe("bad or missing data", () => {
    it("returns an empty report for an empty or missing kit", () => {
      for (const input of [{}, undefined, null]) {
        const result = computeWeakSpots(input);
        expect(result.items).toEqual([]);
        expect(result.summary).toEqual({
          requirements: 0,
          weak: 0,
          not_practised: 0,
          strong: 0,
          mock_answers: 0,
        });
        expect(result.revision).toEqual({ question_ids: [], flashcard_ids: [] });
      }
    });

    it("ignores unknown requirement ids, invalid ratings and non-integer scores", () => {
      const data = {
        role: { requirements: [req("r1")] },
        questions: [q("q1", ["r1", "ghost"])],
        flashcards: [f("f1", ["ghost"]), f("f2", ["r1"])],
        practice: { f1: 3, f2: 7 }, // 7 is not a valid rating
        mock: { q1: { score: 3.5 } }, // not an integer
      };
      const run = () => computeWeakSpots(data);
      expect(run).not.toThrow();
      const item = byId(run(), "r1");
      expect(item.status).toBe("not_practised");
      expect(item.signals).toBe(0);
    });
  });
});