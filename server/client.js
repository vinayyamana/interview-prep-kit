const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_RETRIES = 5;
const MIN_GAP_MS = Number(process.env.LLM_MIN_GAP_MS || 1500);
const REQUEST_TIMEOUT_MS = 60000;
const MAX_WAIT_MS = 65000;

// Dev-only cache so repeated test runs don't burn the free daily quota.
const CACHE_ON = process.env.LLM_CACHE === "1";
const CACHE_DIR = path.join(__dirname, "..", "..", ".llm-cache");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Space out calls so we rarely hit the per-minute limit in the first place.
let nextSlot = 0;
async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await sleep(slot - now);
}

function isRateLimit(err) {
  return (err.status || err.statusCode) === 429 || /429|quota|rate/i.test(err.message || "");
}

function isRetryable(err) {
  const status = err.status || err.statusCode;
  if (/PerDay/i.test(err.message || "")) return false; // daily quota: waiting won't help
  return (
    status === 429 ||
    status >= 500 ||
    err instanceof SyntaxError ||
    /fetch failed|ECONNRESET|ETIMEDOUT|timeout|aborted/i.test(err.message || "")
  );
}

// Prefer the provider's own "retry in Ns" hint; otherwise exponential backoff.
function retryDelayMs(err, attempt) {
  const m = /retry\w*\D{0,12}([\d.]+)\s*s/i.exec(err.message || "");
  const hinted = m ? Math.ceil(Number(m[1]) * 1000) + 500 : 0;
  const backoff = Math.min(2000 * 2 ** attempt, 30000) + Math.random() * 500;
  return Math.min(Math.max(hinted, backoff), MAX_WAIT_MS);
}

function cacheFile(prompt, system) {
  const key = crypto.createHash("sha256").update(`${MODEL}\n${system || ""}\n${prompt}`).digest("hex");
  return path.join(CACHE_DIR, `${key}.json`);
}

function parseJson(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

async function generateJson(prompt, { system } = {}) {
  const file = cacheFile(prompt, system);
  if (CACHE_ON && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel(
    {
      model: MODEL,
      systemInstruction: system,
      generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    },
    { timeout: REQUEST_TIMEOUT_MS }
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pace();
      const result = await model.generateContent(prompt);
      const data = parseJson(result.response.text());
      if (CACHE_ON) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data));
      }
      return data;
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRetryable(err)) {
        const e = new Error(`LLM_FAILED after ${attempt + 1} attempt(s): ${err.message}`);
        e.code = isRateLimit(err) ? "LLM_RATE_LIMITED" : "LLM_FAILED";
        e.status = err.status;
        throw e;
      }
      await sleep(retryDelayMs(err, attempt));
    }
  }
}

module.exports = { generateJson };