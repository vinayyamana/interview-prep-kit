const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_RETRIES = 4;

// Dev-only cache so repeated test runs don't burn the free daily quota.
const CACHE_ON = process.env.LLM_CACHE === "1";
const CACHE_DIR = path.join(__dirname, "..", "..", ".llm-cache");

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

function cacheFile(prompt, system) {
  const key = crypto.createHash("sha256").update(`${MODEL}\n${system || ""}\n${prompt}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.json`);
}

async function generateJson(prompt, { system } = {}) {
  const file = cacheFile(prompt, system);
  if (CACHE_ON && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: system,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const data = JSON.parse(result.response.text());
      if (CACHE_ON) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      }
      return data;
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      await sleep(2000 * 2 ** attempt + Math.random() * 500);
    }
  }
}

module.exports = { generateJson };