// server/services/llm/client.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.GEMINI_API_KEY; // .env lo mee key peru ide ayite; lekapothe line marchu
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // mee .env/old code lo unna model peru pettu
const CACHE_DIR = path.join(__dirname, "../../.llm-cache");
const CACHE_ENABLED = process.env.LLM_CACHE !== "0";
const MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS || 2000);
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 60000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callProvider(prompt, { system } = {}) {
  if (!API_KEY) {
    const e = new Error("GEMINI_API_KEY is not set");
    e.code = "LLM_NOT_CONFIGURED";
    e.status = 401; // not retryable
    throw e;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const e = new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status;
    e.headers = { "retry-after": res.headers.get("retry-after") };
    // Gemini 429 bodies carry "retryDelay": "17s"
    const m = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    if (m) e.retryAfter = Number(m[1]);
    throw e;
  }

  const data = await res.json();
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
  if (!out) {
    const e = new Error(`Gemini returned no text (${data.candidates?.[0]?.finishReason || "unknown"})`);
    e.status = 502; // empty response -> retry
    throw e;
  }
  return out;
}

// Serialize + throttle so calls don't burst past the per-minute limit
let queue = Promise.resolve();
let lastCallAt = 0;
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastCallAt = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

function isRetryable(err) {
  const s = err.status || err.statusCode;
  if (s === 429 || (s >= 500 && s < 600)) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|timeout|aborted/i.test(
    `${err.code || ""} ${err.name || ""} ${err.message || ""}`
  );
}

function retryAfterMs(err) {
  const h = err.headers?.["retry-after"] ?? err.retryAfter;
  const n = Number(h);
  return Number.isFinite(n) && n > 0 ? n * 1000 : null;
}

async function callWithRetry(prompt, opts) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await throttled(() => callProvider(prompt, opts));
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) break;
      const backoff = retryAfterMs(err) ?? BASE_DELAY_MS * 2 ** attempt;
      await sleep(backoff + Math.random() * 500); // jitter
    }
  }
  const e = new Error(`LLM call failed: ${lastErr.message}`);
  e.code = "LLM_UNAVAILABLE";
  throw e;
}

function extractJson(raw) {
  const text = String(raw).replace(/```json|```/g, "").trim();
  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i !== -1);
  if (!starts.length) throw new Error("No JSON in model output");
  const start = Math.min(...starts);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(text.slice(start, end + 1));
}

function cacheKey(prompt, system) {
  return crypto.createHash("sha256").update(`${MODEL}\n${system || ""}\n${prompt}`).digest("hex");
}

async function generateJson(prompt, { system, cache = true } = {}) {
  const useCache = CACHE_ENABLED && cache;
  const file = path.join(CACHE_DIR, `${cacheKey(prompt, system)}.json`);

  if (useCache && fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {} // corrupt cache -> ignore
  }

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await callWithRetry(prompt, { system });
    try {
      const parsed = extractJson(raw);
      if (useCache) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, JSON.stringify(parsed)); // cache only valid JSON
      }
      return parsed;
    } catch (err) {
      lastErr = err; // invalid JSON -> ask again
    }
  }
  const e = new Error(`Model returned invalid JSON: ${lastErr.message}`);
  e.code = "INVALID_MODEL_JSON";
  throw e;
}

module.exports = { generateJson };