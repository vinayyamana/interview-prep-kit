const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err) {
  const status = err.status || err.statusCode;
  if (/PerDay/i.test(err.message || "")) return false;
  return (
    status === 429 ||
    status >= 500 ||
    err instanceof SyntaxError ||
    /fetch failed|ECONNRESET|ETIMEDOUT/i.test(err.message || "")
  );
}

async function generateJson(prompt, { system } = {}) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      await sleep(2000 * 2 ** attempt + Math.random() * 500);
    }
  }
}

module.exports = { generateJson };