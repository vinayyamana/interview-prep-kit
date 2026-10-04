import { describe, it, expect } from "vitest";
import { buildSchedule, findUnscheduledMustIds } from "../services/schedule/buildSchedule.js";

const reqs = [
  { id: "r1", text: "5 years of Node.js", topic: "Node.js", priority: "must" },
  { id: "r2", text: "MongoDB or another NoSQL database", topic: "NoSQL", priority: "must" },
  { id: "r3", text: "Docker and Kubernetes", topic: "Docker", priority: "nice" },
];

const q = (id, requirement_ids, category, difficulty, prompt = `Question ${id}`) => ({
  id,
  requirement_ids,
  category,
  difficulty,
  prompt,
});

// first (1-based) day on which some question covers the requirement
function firstDayCovering(schedule, questions, reqId) {
  const byId = new Map(questions.map((x) => [x.id, x]));
  const day = schedule.days.find((d) =>
    d.question_ids.some((id) => byId.get(id).requirement_ids.includes(reqId))
  );
  return day ? day.day : Infinity;
}

describe("buildSchedule ordering", () => {
  const questions = [
    q("q1", ["r1"], "technical", 3),
    q("q2", ["r1"], "technical", 2),
    q("q3", ["r2"], "technical", 2),
    q("q4", ["r3"], "technical", 3), // nice-to-have, but the hardest question
  ];

  it("puts every must-have before nice-to-have material", () => {
    const schedule = buildSchedule(questions, reqs, 4);
    const nice = firstDayCovering(schedule, questions, "r3");
    expect(firstDayCovering(schedule, questions, "r1")).toBeLessThan(nice);
    expect(firstDayCovering(schedule, questions, "r2")).toBeLessThan(nice);
  });

  it("does not make a must-have wait behind another requirement's whole question set", () => {
    const schedule = buildSchedule(questions, reqs, 4);
    expect(firstDayCovering(schedule, questions, "r2")).toBeLessThan(3);
  });

  it("schedules every must-have requirement", () => {
    const schedule = buildSchedule(questions, reqs, 4);
    expect(findUnscheduledMustIds(schedule, questions, reqs)).toEqual([]);
  });
});

describe("buildSchedule day focus labels", () => {
  it("reflects the question category", () => {
    const questions = [
      q("q1", ["r1"], "technical", 3),
      q("q2", ["r1"], "system-design", 2),
      q("q3", ["r1"], "company-fit", 1),
    ];
    const schedule = buildSchedule(questions, reqs, 3);
    expect(schedule.days.map((d) => d.focus)).toEqual([
      "Node.js",
      "System design: Node.js",
      "Company fit",
    ]);
  });

  it("never gives two days the same label", () => {
    const questions = [
      q("q1", ["r1"], "technical", 3, "How does the event loop work?"),
      q("q2", ["r1"], "technical", 3, "How does garbage collection work?"),
      q("q3", ["r1"], "technical", 3, "How do streams handle backpressure?"),
      q("q4", ["r1"], "technical", 3, "How do worker threads differ from cluster?"),
    ];
    const labels = buildSchedule(questions, reqs, 4).days.map((d) => d.focus);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("buildSchedule day counts", () => {
  const questions = [
    q("q1", ["r1"], "technical", 3),
    q("q2", ["r2"], "technical", 2),
    q("q3", ["r3"], "technical", 1),
  ];

  it("puts everything on one day for a 1-day schedule", () => {
    const schedule = buildSchedule(questions, reqs, 1);
    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0].question_ids).toHaveLength(3);
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
  });

  it("fills a 60-day schedule with integer minutes and real question ids", () => {
    const schedule = buildSchedule(questions, reqs, 60);
    const ids = new Set(questions.map((x) => x.id));
    expect(schedule.days).toHaveLength(60);
    for (const d of schedule.days) {
      expect(Number.isInteger(d.minutes)).toBe(true);
      for (const id of d.question_ids) expect(ids.has(id)).toBe(true);
    }
  });
});

