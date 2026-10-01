require("dotenv").config();
const { generateFlashcards } = require("../services/generate/flashcards");

const questions = [
  { id: "q1", category: "technical", requirement_ids: ["r1"],
    prompt: "How does the Node.js event loop handle async I/O under heavy load?",
    answer_outline: "Phases: timers, poll, check. libuv thread pool. Avoid blocking with worker threads." },
  { id: "q2", category: "system-design", requirement_ids: ["r3"],
    prompt: "Design a system handling 50,000 requests per second.",
    answer_outline: "Stateless servers, Redis cache, load balancer, sharding, message queue." },
  { id: "q3", category: "behavioural", requirement_ids: ["r4"],
    prompt: "Tell me about a conflict with a teammate.",
    answer_outline: "STAR format." },
];

generateFlashcards(questions).then((cards) => console.log(JSON.stringify(cards, null, 2)));