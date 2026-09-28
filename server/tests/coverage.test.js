import { describe, it, expect } from "vitest";
import { checkCoverage } from "../services/coverage/checkCoverage.js";

const requirements = [
  { id: "r1", priority: "must" },
  { id: "r2", priority: "must" },
  { id: "r3", priority: "nice" },
];

describe("checkCoverage", () => {
  it("reports no gaps when every must-have requirement has a question", () => {
    const questions = [
      { requirement_ids: ["r1"] },
      { requirement_ids: ["r2"] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual([]);
  });

  it("reports a gap for an uncovered must-have requirement", () => {
    const questions = [{ requirement_ids: ["r1"] }];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).toEqual(["r2"]);
  });

  it("does not require coverage for nice-to-have requirements", () => {
    const questions = [
      { requirement_ids: ["r1"] },
      { requirement_ids: ["r2"] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredRequirementIds).not.toContain("r3");
  });
});