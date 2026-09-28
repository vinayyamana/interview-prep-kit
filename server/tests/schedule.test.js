import { describe, it, expect } from "vitest";
import { buildSchedule } from "../services/schedule/buildSchedule.js";

const requirements = [
  { id: "r1", priority: "must" },
  { id: "r2", priority: "nice" },
];

const questions = [
  { id: "q1", category: "technical", difficulty: 3, requirement_ids: ["r1"] },
  { id: "q2", category: "technical", difficulty: 1, requirement_ids: ["r1"] },
  { id: "q3", category: "technical", difficulty: 2, requirement_ids: ["r2"] },
];

describe("buildSchedule", () => {
  it("creates exactly the number of days requested", () => {
    const schedule = buildSchedule(questions, requirements, 5);
    expect(schedule.days).toHaveLength(5);
    expect(schedule.days_available).toBe(5);
  });

  it("gives every day an integer minutes value", () => {
    const schedule = buildSchedule(questions, requirements, 3);
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it("assigns every question to exactly one day", () => {
    const schedule = buildSchedule(questions, requirements, 2);
    const allIds = schedule.days.flatMap((d) => d.question_ids);
    expect(allIds.sort()).toEqual(["q1", "q2", "q3"].sort());
  });

  it("falls back to 1 day when days_available is invalid", () => {
    const schedule = buildSchedule(questions, requirements, 0);
    expect(schedule.days_available).toBe(1);
  });
});