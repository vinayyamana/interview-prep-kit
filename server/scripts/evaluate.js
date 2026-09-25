require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ⚠️ Adjust this import to match your actual pipeline/assembler file
const { assembleKit } = require('../pipeline/assembleKit');

function getArg(flagName) {
  const idx = process.argv.indexOf(flagName);
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error(`Missing required argument: ${flagName}`);
    process.exit(1);
  }
  return process.argv[idx + 1];
}

const inputPath = getArg('--input');
const outputPath = getArg('--output');

function loadCases(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch (err) {
    console.error(`Could not read input file at ${filePath}:`, err.message);
    process.exit(1);
  }

  let cases;
  try {
    cases = JSON.parse(raw);
  } catch (err) {
    console.error(`Input file is not valid JSON:`, err.message);
    process.exit(1);
  }

  if (!Array.isArray(cases)) {
    console.error('Input file must be a JSON array of cases.');
    process.exit(1);
  }

  return cases;
}

async function runCase(c) {
  if (!c.id || !c.jd || !c.company_url || !c.days) {
    return {
      id: c.id || 'unknown',
      status: 'failed',
      kit: null,
      error: {
        code: 'INVALID_CASE',
        message: 'Case is missing one of: id, jd, company_url, days',
      },
    };
  }

  try {
    const kit = await assembleKit({
      jd: c.jd,
      companyUrl: c.company_url,
      days: c.days,
    });

    return {
      id: c.id,
      status: 'ok',
      kit,
      error: null,
    };
  } catch (err) {
    console.error(`Case ${c.id} failed:`, err.message);
    return {
      id: c.id,
      status: 'failed',
      kit: null,
      error: {
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message || String(err),
      },
    };
  }
}

async function main() {
  const cases = loadCases(inputPath);
  const kits = [];

  console.log(`Running ${cases.length} case(s)...`);

  for (const c of cases) {
    console.log(`→ Processing case: ${c.id}`);
    const result = await runCase(c);
    kits.push(result);
  }

  const output = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits,
  };

  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(output, null, 2));

  const okCount = kits.filter((k) => k.status === 'ok').length;
  const failCount = kits.length - okCount;
  console.log(`Done. ${okCount} ok, ${failCount} failed. Output written to ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error in evaluate script:', err);
  process.exit(1);
});