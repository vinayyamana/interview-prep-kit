require("dotenv").config();
const { closeCoverageGaps } = require("./services/generate/closeGaps");

const role = {
  title: "Backend Engineer",
  seniority: "senior",
  requirements: [
    { id: "r1", text: "5+ years of experience with Node.js", kind: "technical", priority: "must" },
    { id: "r2", text: "Strong knowledge of MongoDB", kind: "technical", priority: "must" },
    { id: "r3", text: "Mentor junior engineers", kind: "behavioural", priority: "must" },
  ],
};

const research = { companyText: "", hiringText: "", discussion: [] };

// Draft with a deliberate gap: no question covers r2 (MongoDB)
const questions = [
  { id: "q1", category: "technical", requirement_ids: ["r1"], prompt: "How does the Node.js event loop work?", answer_outline: "Phases, microtasks, blocking.", difficulty: 2 },
  { id: "q2", category: "behavioural", requirement_ids: ["r3"], prompt: "Tell me about a time you mentored a junior engineer.", answer_outline: "STAR format.", difficulty: 2 },
];

(async () => {
  const result = await closeCoverageGaps({ role, research, questions });
  console.log("HISTORY:", JSON.stringify(result.history));
  console.log("UNCOVERED:", result.uncoveredRequirementIds);
  console.log("TOTAL QUESTIONS:", result.questions.length);
})();