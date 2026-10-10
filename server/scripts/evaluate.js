require('dotenv').config();
const fs = require('fs');
const path = require('path');
// npm sets INIT_CWD to the folder the user ran the command from,
// so relative --input/--output paths work from the repo root too.
const baseDir = process.env.INIT_CWD || process.cwd();

const { assembleKit } = require('../services/assembleKit');

const MAX_DAYS = 365;
const CASE_TIMEOUT_MS = Number(process.env.EVAL_CASE_TIMEOUT_MS) || 170000;
const CONCURRENCY = Math.max(1, Number(process.env.EVAL_CONCURRENCY) || 2);

// Pipeline code should throw errors with one of these `code`s.
const KNOWN_CODES = new Set([
  'COMPANY_UNREACHABLE',
  'LLM_FAILED',
  'LLM_RATE_LIMITED',
  'INVALID_KIT',
  'CASE_TIMEOUT',
  'INVALID_CASE',
]);

function getArg(flagName) {
  const idx = process.argv.indexOf(flagName);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required argument: ${flagName}`);
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }
  return process.argv[idx + 1];
}

const inputPath = getArg('--input');
const outputPath = getArg('--output');

function loadCases(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(path.resolve(baseDir, filePath), 'utf-8').replace(/^\uFEFF/, '');
  } catch (err) {
    console.error(`Could not read input file at ${filePath}:`, err.message);
    process.exit(1);
  }

  let cases;
  try {
    cases = JSON.parse(raw);
  } catch (err) {
    console.error('Input file is not valid JSON:', err.message);
    process.exit(1);
  }

  // Accept a bare array, or an object like { "cases": [...] }
  const list = Array.isArray(cases)
    ? cases
    : cases && Array.isArray(cases.cases)
      ? cases.cases
      : null;

  if (!list) {
    const found = Array.isArray(cases)
      ? 'array'
      : cases && typeof cases === 'object'
        ? `object with keys: ${Object.keys(cases).join(', ')}`
        : typeof cases;
    console.error(`Input file must be a JSON array of cases. Found: ${found}`);
    process.exit(1);
  }

  return list;
}

// Returns an error string, or null if the case is usable.
function validateCase(c, seenIds) {
  if (!c || typeof c !== 'object') return 'case must be an object';
  if (typeof c.id !== 'string' || !c.id) return 'id must be a non-empty string';
  if (seenIds.has(c.id)) return `duplicate id "${c.id}"`;
  if (typeof c.jd !== 'string' || !c.jd.trim()) return 'jd must be a non-empty string';
  if (typeof c.company_url !== 'string' || !c.company_url.trim()) {
    return 'company_url must be a non-empty string';
  }
  const days = Number(c.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return `days must be an integer between 1 and ${MAX_DAYS}`;
  }
  return null;
}

// Map internal errors to stable error codes (Appendix B).
// Pipeline code should set err.code; regexes are only a fallback.
function toErrorInfo(err) {
  const msg = String((err && err.message) || err);
  const code = err && err.code;

  if (typeof code === 'string' && KNOWN_CODES.has(code)) {
    return { code, message: msg };
  }
  if (/COMPANY_UNREACHABLE|ENOTFOUND|resolve hostname|unreachable/i.test(msg)) {
    return { code: 'COMPANY_UNREACHABLE', message: msg };
  }
  if (/rate.?limit|429/i.test(msg)) {
    return { code: 'LLM_RATE_LIMITED', message: msg };
  }
  if (/invalid json|schema|invalid kit/i.test(msg)) {
    return { code: 'INVALID_KIT', message: msg };
  }
  return { code: typeof code === 'string' ? code : 'UNKNOWN_ERROR', message: msg };
}

function withTimeout(promise, ms, id) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`Case ${id} exceeded ${Math.round(ms / 1000)}s`);
      e.code = 'CASE_TIMEOUT';
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runCase(c, seenIds) {
  const problem = validateCase(c, seenIds);
  if (problem) {
    return {
      id: (c && typeof c.id === 'string' && c.id) || 'unknown',
      status: 'failed',
      kit: null,
      error: { code: 'INVALID_CASE', message: problem },
    };
  }
  seenIds.add(c.id);

  try {
    const kit = await withTimeout(
      assembleKit({ jd: c.jd, companyUrl: c.company_url, days: Number(c.days) }),
      CASE_TIMEOUT_MS,
      c.id
    );
    return { id: c.id, status: 'ok', kit, error: null };
  } catch (err) {
    console.error(`Case ${c.id} failed:`, err.message);
    return { id: c.id, status: 'failed', kit: null, error: toErrorInfo(err) };
  }
}

// Write to a temp file then rename, so a crash never leaves a half-written output.
function writeOutput(kits) {
  const output = {
    version: '1.0',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    kits,
  };
  const target = path.resolve(baseDir, outputPath);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(output, null, 2));
  fs.renameSync(tmp, target);
}

async function main() {
  const cases = loadCases(inputPath);
  const results = new Array(cases.length);
  const seenIds = new Set();
  const started = Date.now();
  let next = 0;

  console.log(`Running ${cases.length} case(s) with concurrency ${CONCURRENCY}...`);

  async function worker() {
    while (next < cases.length) {
      const i = next++;
      const c = cases[i];
      console.log(`-> Processing case: ${(c && c.id) || 'unknown'}`);
      results[i] = await runCase(c, seenIds);
      // save after every case so partial results survive a crash
      writeOutput(results.filter(Boolean));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

  const kits = results.filter(Boolean);
  writeOutput(kits);

  const okCount = kits.filter((k) => k.status === 'ok').length;
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`Done. ${okCount} ok, ${kits.length - okCount} failed in ${secs}s. Output written to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error in evaluate script:', err);
  process.exit(1);
});