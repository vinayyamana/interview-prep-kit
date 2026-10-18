require("dotenv").config();
const { scoreAnswer } = require("./services/generate/scoreAnswer");

scoreAnswer({
  question: {
    prompt: "How does the Node.js event loop handle async I/O?",
    answer_outline: "Single thread, libuv, callback queue, non-blocking I/O, microtasks vs macrotasks",
  },
  answer: "Node uses one thread and libuv to hand I/O to the OS, then runs callbacks from the queue when it finishes.",
  requirementTexts: ["Strong Node.js fundamentals"],
})
  .then((r) => console.log(r))
  .catch((e) => console.error("FAILED:", e.code, e.message));