import { describe, it, expect } from "vitest";
import { z } from "zod";

const KitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        kind: z.enum(["technical", "behavioural", "domain"]),
        priority: z.enum(["must", "nice"]),
      })
    ),
  }),
  questions: z.array(
    z.object({
      id: z.string(),
      requirement_ids: z.array(z.string()),
      category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
      prompt: z.string(),
      answer_outline: z.string(),
      difficulty: z.number().min(1).max(3),
    })
  ),
  flashcards: z.array(
    z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
      requirement_ids: z.array(z.string()),
    })
  ),
  schedule: z.object({
    days_available: z.number(),
    days: z.array(
      z.object({
        day: z.number(),
        focus: z.string(),
        question_ids: z.array(z.string()),
        minutes: z.number().int(),
      })
    ),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number(),
  }),
});

describe("kit structure", () => {
  it("validates a well-formed kit against Appendix A", () => {
    const kit = {
      source: {
        company: "acme", company_url: "https://acme.com", role: "Engineer",
        location: "", jd_chars: 100, researched_at: new Date().toISOString(), pages_used: [],
      },
      company_brief: { summary: "s", what_they_do: "d", sources: [] },
      role: {
        title: "Engineer", seniority: "Senior", responsibilities: [],
        requirements: [{ id: "r1", text: "5 years", kind: "technical", priority: "must" }],
      },
      questions: [
        { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p", answer_outline: "a", difficulty: 2 },
      ],
      flashcards: [{ id: "f1", front: "f", back: "b", requirement_ids: ["r1"] }],
      schedule: { days_available: 1, days: [{ day: 1, focus: "technical", question_ids: ["q1"], minutes: 30 }] },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    };
    expect(() => KitSchema.parse(kit)).not.toThrow();
  });

  it("rejects a kit missing required fields", () => {
    const badKit = { source: {} };
    expect(() => KitSchema.parse(badKit)).toThrow();
  });

  it("rejects an invalid requirement priority", () => {
    const badKit = {
      source: { company: "a", company_url: "u", role: "r", location: "", jd_chars: 1, researched_at: "x", pages_used: [] },
      company_brief: { summary: "s", what_they_do: "d", sources: [] },
      role: { title: "t", seniority: "s", responsibilities: [], requirements: [{ id: "r1", text: "t", kind: "technical", priority: "urgent" }] },
      questions: [], flashcards: [],
      schedule: { days_available: 1, days: [] },
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    };
    expect(() => KitSchema.parse(badKit)).toThrow();
  });
});