const { z } = require("zod");

const str = z.string();
const ids = z.array(z.string()).min(1);

const kitSchema = z.object({
  source: z.object({
    company: str, company_url: str, role: str, location: str,
    jd_chars: z.number().int().min(0),
    researched_at: str,
    pages_used: z.array(str),
  }),
  company_brief: z.object({
    summary: str, what_they_do: str, sources: z.array(str),
  }),
  role: z.object({
    title: str, seniority: str,
    responsibilities: z.array(str),
    requirements: z.array(z.object({
      id: z.string().min(1), text: z.string().min(1),
      kind: z.enum(["technical", "behavioural", "domain"]),
      priority: z.enum(["must", "nice"]),
    })),
  }),
  questions: z.array(z.object({
    id: z.string().min(1),
    requirement_ids: ids,
    category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
    prompt: z.string().min(1), answer_outline: str,
    difficulty: z.number().int().min(1).max(3),
  })),
  flashcards: z.array(z.object({
    id: z.string().min(1), front: str, back: str,
    requirement_ids: z.array(z.string()),
  })),
  schedule: z.object({
    days_available: z.number().int().min(1),
    days: z.array(z.object({
      day: z.number().int().min(1), focus: str,
      question_ids: z.array(z.string()),
      minutes: z.number().int().min(0),
    })),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().min(0),
  }),
}).superRefine((kit, ctx) => {
  const add = (message) => ctx.addIssue({ code: "custom", message });
  const reqIds = new Set(kit.role.requirements.map(r => r.id));
  const qIds = new Set(kit.questions.map(q => q.id));

  if (reqIds.size !== kit.role.requirements.length) add("Duplicate requirement id");
  if (qIds.size !== kit.questions.length) add("Duplicate question id");

  kit.questions.forEach(q =>
    q.requirement_ids.forEach(id => { if (!reqIds.has(id)) add(`${q.id} refers to unknown ${id}`); }));
  kit.flashcards.forEach(f =>
    f.requirement_ids.forEach(id => { if (!reqIds.has(id)) add(`${f.id} refers to unknown ${id}`); }));
  kit.schedule.days.forEach(d =>
    d.question_ids.forEach(id => { if (!qIds.has(id)) add(`Day ${d.day} refers to unknown ${id}`); }));

  if (kit.schedule.days.length !== kit.schedule.days_available)
    add("Schedule days must equal days_available");
});

function validateKit(kit) {
  const r = kitSchema.safeParse(kit);
  return r.success
    ? { ok: true, kit: r.data }
    : { ok: false, errors: r.error.issues.map(i => `${i.path.join(".")}: ${i.message}`) };
}

module.exports = { kitSchema, validateKit };