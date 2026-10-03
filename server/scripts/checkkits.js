const fs = require("fs");

const file = process.argv[2] || "kits.json";
const out = JSON.parse(fs.readFileSync(file, "utf8"));
const problems = [];
const bad = (id, msg) => problems.push(`[${id}] ${msg}`);

if (out.version !== "1.0") bad("file", "version must be '1.0'");
if (!out.generated_at) bad("file", "generated_at missing");
if (!Array.isArray(out.kits)) bad("file", "kits must be an array");

for (const entry of out.kits || []) {
  const id = entry.id;
  if (!["ok", "failed"].includes(entry.status)) bad(id, "status must be ok|failed");

  if (entry.status === "failed") {
    if (entry.kit !== null) bad(id, "failed entry must have kit: null");
    if (!entry.error?.code || !entry.error?.message) bad(id, "failed entry needs error.code and error.message");
    else console.log(`[${id}] failed -> ${entry.error.code}: ${entry.error.message}`);
    continue;
  }

  const k = entry.kit;
  if (!k) { bad(id, "ok entry has no kit"); continue; }

  for (const key of ["source", "company_brief", "role", "questions", "flashcards", "schedule", "coverage"]) {
    if (!k[key]) bad(id, `missing ${key}`);
  }
  for (const f of ["company", "company_url", "role", "location", "jd_chars", "researched_at", "pages_used"]) {
    if (k.source && !(f in k.source)) bad(id, `source.${f} missing`);
  }

  const reqs = k.role?.requirements || [];
  const reqIds = new Set(reqs.map((r) => r.id));
  if (reqIds.size !== reqs.length) bad(id, "duplicate requirement ids");
  for (const r of reqs) {
    if (!["technical", "behavioural", "domain"].includes(r.kind)) bad(id, `${r.id} bad kind ${r.kind}`);
    if (!["must", "nice"].includes(r.priority)) bad(id, `${r.id} bad priority ${r.priority}`);
  }

  const qs = k.questions || [];
  const qIds = new Set(qs.map((q) => q.id));
  if (qIds.size !== qs.length) bad(id, "duplicate question ids");
  const covered = new Set();
  for (const q of qs) {
    if (!["technical", "behavioural", "system-design", "company-fit"].includes(q.category)) bad(id, `${q.id} bad category`);
    if (![1, 2, 3].includes(q.difficulty)) bad(id, `${q.id} difficulty must be 1-3`);
    for (const rid of q.requirement_ids || []) {
      if (!reqIds.has(rid)) bad(id, `${q.id} references unknown ${rid}`);
      covered.add(rid);
    }
  }
  for (const r of reqs) {
    if (r.priority === "must" && !covered.has(r.id)) bad(id, `must requirement ${r.id} has no question`);
  }

  const days = k.schedule?.days || [];
  if (days.length !== k.schedule?.days_available) bad(id, `schedule has ${days.length} days, days_available=${k.schedule?.days_available}`);
  for (const d of days) {
    if (!Number.isInteger(d.minutes)) bad(id, `day ${d.day} minutes not integer`);
    for (const qid of d.question_ids || []) if (!qIds.has(qid)) bad(id, `day ${d.day} unknown question ${qid}`);
  }
  const scheduled = new Set(days.flatMap((d) => d.question_ids || []));
  for (const r of reqs) {
    if (r.priority !== "must") continue;
    const inSchedule = qs.some((q) => (q.requirement_ids || []).includes(r.id) && scheduled.has(q.id));
    if (!inSchedule) bad(id, `must requirement ${r.id} not in schedule`);
  }

  if ((k.coverage?.uncovered_requirement_ids || []).length) bad(id, "coverage.uncovered_requirement_ids not empty");
  console.log(`[${id}] ok -> ${reqs.length} reqs, ${qs.length} questions, ${days.length} days, passes ${k.coverage?.passes}`);
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n${problems.join("\n")}` : "\nSTRUCTURE OK");
process.exit(problems.length ? 1 : 0);