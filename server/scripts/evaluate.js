require('dotenv').config();
const fs = require('fs');
const path = require('path');
// npm sets INIT_CWD to the folder the user ran the command from,
// so relative --input/--output paths work from the repo root too.
const baseDir = process.env.INIT_CWD || process.cwd();

const { assembleKit } = require('../services/assembleKit');

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
    raw = fs.readFileSync(path.resolve(baseDir, filePath), 'utf-8');
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

  if (!Array.isArray(cases)) {
    console.error('Input file must be a JSON array of cases.');
    process.exit(1);
  }

  return cases;
}

function validateCase(c) {
  if (!c || typeof c !== 'object') return 'case must be an object';
  if (typeof c.id !== 'string' || !c.id) return 'id must be a non-empty string';
  if (typeof c.jd !== 'string' || !c.jd.trim()) return 'jd must be a non-empty string';
  if (typeof c.company_url !== 'string' || !c.company_url.trim()) return 'company_url must be a non-empty string';
  if (!Number.isInteger(c.days) || c.days < 1) return 'days must be an integer >= 1';
  return null;
}

// Map internal errors to stable error codes (Appendix B)
function toErrorInfo(err) {
  const msg = String((err && err.message) || err);
  const code = err && err.code;

  if (
    code === 'COMPANY_UNREACHABLE' ||
    /COMPANY_UNREACHABLE|ENOTFOUND|resolve hostname|fetch failed|unreachable/i.test(msg)
  ) {
    return { code: 'COMPANY_UNREACHABLE', message: 'Company site unreachable after 3 retries.' };
  }
  return { code: code || 'UNKNOWN_ERROR', message: msg };
}

async function runCase(c) {
  const problem = validateCase(c);
  if (problem) {
    return {
      id: (c && c.id) || 'unknown',
      status: 'failed',
      kit: null,
      error: { code: 'INVALID_CASE', message: problem },
    };
  }

  try {
    const kit = await assembleKit({
      jd: c.jd,
      companyUrl: c.company_url,
      days: c.days,
    });
    return { id: c.id, status: 'ok', kit, error: null };
  } catch (err) {
    console.error(`Case ${c.id} failed:`, err.message);
    return { id: c.id, status: 'failed', kit: null, error: toErrorInfo(err) };
  }
}

function writeOutput(kits) {
  const output = {
    version: '1.0',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    kits,
  };
  fs.writeFileSync(path.resolve(baseDir, outputPath), JSON.stringify(output, null, 2));
}

async function main() {
  const cases = loadCases(inputPath);
  const kits = [];
  const started = Date.now();

  console.log(`Running ${cases.length} case(s)...`);

  for (const c of cases) {
    const id = (c && c.id) || 'unknown';
    console.log(`→ Processing case: ${id}`);
    kits.push(await runCase(c));
    writeOutput(kits); // save after every case so partial results survive a crash
  }

  const okCount = kits.filter((k) => k.status === 'ok').length;
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`Done. ${okCount} ok, ${kits.length - okCount} failed in ${secs}s. Output written to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error in evaluate script:', err);
  process.exit(1);
});