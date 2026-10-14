import { vi, test, expect } from "vitest";
import { closeCoverageGaps } from "../services/generate/closeGaps.js";

const role = {
  requirements: [
    { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
    { id: "r2", text: "MongoDB", kind: "technical", priority: "must" },
    { id: "r3", text: "Docker", kind: "technical", priority: "nice" },
  ],
};
const draft = () => [
  { id: "q1", category: "technical", prompt: "Node?", requirement_ids: ["r1"] },
];
const run = (generate) =>
  closeCoverageGaps({ role, research: {}, questions: draft(), generate });

test("LLM closes the gaps in pass 2", async () => {
  const generate = vi.fn().mockResolvedValue([
    { category: "technical", prompt: "Mongo?", requirement_ids: ["r2"] },
    { category: "technical", prompt: "Docker?", requirement_ids: ["r3"] },
  ]);
  const out = await run(generate);
  expect(out.uncoveredRequirementIds).toEqual([]);
  expect(out.passes).toBe(2);
  expect(out.fallbackRequirementIds).toEqual([]);
});

test("LLM never helps: stops after max rounds, fallback closes gaps", async () => {
  const generate = vi.fn().mockResolvedValue([]);
  const out = await run(generate);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(out.fallbackRequirementIds).toEqual(["r2"]);
  expect(out.uncoveredRequirementIds).toEqual([]);
  expect(out.history.at(-1).pass).toBe("fallback");
});

test("invented requirement ids are dropped", async () => {
  const generate = vi.fn().mockResolvedValue([
    { category: "technical", prompt: "Ghost?", requirement_ids: ["r99"] },
  ]);
  const out = await run(generate);
  const ids = out.questions.flatMap((q) => q.requirement_ids);
  expect(ids).not.toContain("r99");
  expect(out.uncoveredRequirementIds).toEqual([]);
});

test("rate limit: no more model calls, fallback used, degraded flag", async () => {
  const generate = vi.fn().mockRejectedValue(new Error("429 rate limit"));
  const out = await run(generate);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(out.degraded).toBe(true);
  expect(out.uncoveredRequirementIds).toEqual([]);
});