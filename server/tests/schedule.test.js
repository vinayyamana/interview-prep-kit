import { test } from "vitest";
import assert from "node:assert";
const { buildSchedule } = require("../services/schedule/buildSchedule");

const requirements = [
  { id: "r1", text: "5+ years Node.js", priority: "must" },
  { id: "r2", text: "MongoDB", priority: "must" },
  { id: "r3", text: "High traffic systems", priority: "must" },
  { id: "r4", text: "Docker", priority: "nice" },
];

const reqFor = ["r1", "r1", "r2", "r2", "r3", "r3", "r4", "r4", "r4"];
const questions = reqFor.map((r, i) => ({
  id: `q${i + 1}`,
  requirement_ids: [r],
  category: "technical",
  difficulty: (i % 3) + 1,
}));

test("schedule has exactly the requested number of days", () => {
  for (const d of [1, 5, 60]) {
    const s = buildSchedule(questions, requirements, d);
    assert.strictEqual(s.days_available, d);
    assert.strictEqual(s.days.length, d);
  }
});

test("minutes are integers and days are numbered 1..n", () => {
  const s = buildSchedule(questions, requirements, 5);
  s.days.forEach((day, i) => {
    assert.ok(Number.isInteger(day.minutes));
    assert.strictEqual(day.day, i + 1);
  });
});

test("every scheduled question id exists", () => {
  const ids = new Set(questions.map((q) => q.id));
  const s = buildSchedule(questions, requirements, 5);
  for (const day of s.days)
    for (const id of day.question_ids) assert.ok(ids.has(id));
});

test("every must requirement appears in the schedule", () => {
  const s = buildSchedule(questions, requirements, 5);
  const scheduled = new Set(
    s.days.flatMap((d) => d.question_ids).map(
      (id) => questions.find((q) => q.id === id).requirement_ids[0]
    )
  );
  for (const r of requirements.filter((r) => r.priority === "must"))
    assert.ok(scheduled.has(r.id), `${r.id} missing`);
});

test("must-have material lands before nice-to-have material", () => {
  const s = buildSchedule(questions, requirements, 5);
  const dayOf = (id) => s.days.findIndex((d) => d.question_ids.includes(id));
  const mustDays = ["q1", "q2", "q3", "q4", "q5", "q6"].map(dayOf);
  const niceDays = ["q7", "q8", "q9"].map(dayOf);
  assert.ok(Math.max(...mustDays) <= Math.min(...niceDays));
});

test("60-day schedule pads with review days", () => {
  const s = buildSchedule(questions, requirements, 60);
  assert.ok(s.days[59].focus.startsWith("Review"));
  assert.ok(s.days.every((d) => d.question_ids.length > 0));
});

test("no questions still gives the requested days", () => {
  const s = buildSchedule([], requirements, 3);
  assert.strictEqual(s.days.length, 3);
  assert.ok(s.days.every((d) => d.minutes === 0));
});

