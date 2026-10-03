const { fetchPage } = require("./fetchPage");

const MAX_PAGES = 8;
const DELAY_MS = 500;
const FIRST_PAGE_RETRIES = 3;
const UA = "Mozilla/5.0 (compatible; InterviewPrepKitBot/1.0)";

// [pattern, points]: higher score = more likely to describe hiring
const KEYWORDS = [
  [/interview|hiring[-_ ]?process|how[-_ ]we[-_ ]hire|recruit/i, 10],
  [/careers?|jobs?|join|work[-_ ]with[-_ ]us|hiring/i, 8],
  [/handbook|culture|values|principles/i, 2],
  [/engineering|tech|team|about|company|who[-_ ]we[-_ ]are|mission/i, 3],
  [/blog|press|news/i, 1],
];
const NEGATIVE = /login|signin|sign-in|signup|cart|privacy|terms|cookie|\.(pdf|zip|png|jpe?g|gif|svg|css|js)(\?|$)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeError(err) {
  const cause = err.cause?.code || err.cause?.message || "";
  return cause ? `${err.message} (${cause})` : err.message;
}

function scoreLink(link) {
  if (NEGATIVE.test(link.url)) return -1;
  const target = `${new URL(link.url).pathname} ${link.text}`;
  let score = 0;
  for (const [re, pts] of KEYWORDS) if (re.test(target)) score += pts;
  return score;
}

async function loadRobots(origin) {
  try {
    const res = await fetch(new URL("/robots.txt", origin), {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const disallow = [];
    let applies = false;
    for (const raw of (await res.text()).split(/\r?\n/)) {
      const line = raw.split("#")[0].trim();
      const [k, ...rest] = line.split(":");
      const key = k.toLowerCase();
      const val = rest.join(":").trim();
      if (key === "user-agent") applies = val === "*" || UA.toLowerCase().includes(val.toLowerCase());
      else if (key === "disallow" && applies && val) disallow.push(val);
    }
    return disallow;
  } catch {
    return []; // robots.txt unreachable -> treat as no restrictions
  }
}

// Retry the start page with backoff: one slow response should not fail the case.
async function fetchFirstPage(url) {
  let lastErr;
  for (let attempt = 1; attempt <= FIRST_PAGE_RETRIES; attempt++) {
    try {
      return await fetchPage(url);
    } catch (err) {
      lastErr = err;
      if (attempt < FIRST_PAGE_RETRIES) await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

// An unreachable company is a research gap, not a fatal error:
// the caller still builds a kit from the job description alone.
function unreachableResult(url, reason) {
  return {
    pages: [],
    hiringPages: [],
    skipped: [{ url: String(url), reason }],
    unreachable: true,
  };
}

async function crawlSite(startUrl) {
  let start;
  try {
    start = new URL(startUrl);
  } catch {
    return unreachableResult(startUrl, "INVALID_URL");
  }

  const disallow = await loadRobots(start.origin);
  const pages = [];
  const skipped = [];
  const seen = new Set([start.href]);

  if (disallow.some((p) => start.pathname.startsWith(p))) {
    return unreachableResult(start.href, "ROBOTS_DISALLOWED");
  }

  let first;
  try {
    first = await fetchFirstPage(start.href);
  } catch (err) {
    return unreachableResult(
      start.href,
      `${describeError(err)} (after ${FIRST_PAGE_RETRIES} tries)`
    );
  }
  pages.push(first);

  const queue = [];
  const enqueue = (page) => {
    for (const link of page.links) {
      const u = new URL(link.url);
      if (u.origin !== start.origin || seen.has(link.url)) continue;
      const score = scoreLink(link);
      if (score > 0) queue.push({ url: link.url, score });
    }
  };
  enqueue(first);

  while (queue.length && pages.length < MAX_PAGES) {
    queue.sort((a, b) => b.score - a.score);
    const { url } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    const path = new URL(url).pathname;
    if (disallow.some((p) => path.startsWith(p))) {
      skipped.push({ url, reason: "ROBOTS_DISALLOWED" });
      continue;
    }
    await sleep(DELAY_MS);
    try {
      const page = await fetchPage(url);
      pages.push(page);
      enqueue(page);
    } catch (err) {
      skipped.push({ url, reason: describeError(err) });
    }
  }

  const hiringPages = pages
    .filter((p) => /interview|hiring|careers?|jobs?|join/i.test(`${new URL(p.url).pathname} ${p.title}`))
    .map((p) => p.url);

  return { pages, hiringPages, skipped, unreachable: false };
}

module.exports = { crawlSite, scoreLink };