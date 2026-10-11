const robotsParser = require("robots-parser");
const { fetchPage } = require("./fetchPage");
const { assertSafeUrl } = require("../security/validateUrl");

const MAX_PAGES = 8;
const DELAY_MS = 500;
const CRAWL_BUDGET_MS = 60_000; // per-company cap so 5 cases fit in 15 min
const ROBOTS_MAX_BYTES = 500_000;
const UA = "Mozilla/5.0 (compatible; InterviewPrepKitBot/1.0)";
const BOT = "InterviewPrepKitBot";

// Hiring-platform hosts that count as "same site" for a company's job board.
const ATS_HOSTS = /(^|\.)(lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com|breezy\.hr|smartrecruiters\.com)$/i;

const KEYWORDS = [
  [/interview|hiring[-_ ]?process|how[-_ ]we[-_ ]hire|recruit/i, 10],
  [/careers?|jobs?|join|work[-_ ]with[-_ ]us|hiring/i, 8],
  [/handbook|culture|values|principles/i, 2],
  [/engineering|tech|team|about|company|who[-_ ]we[-_ ]are|mission/i, 3],
  [/blog|press|news/i, 1],
];

const NEGATIVE =
  /(^|[\/_-])(log-?in|sign-?(in|up)|cart|privacy|terms|cookies?|edit|ide|blob|raw|commits?|merge_requests|issues|compare|tree)([\/_.-]|$)|\.(pdf|zip|png|jpe?g|gif|svg|css|js)$/i;

const CAREERS_RE = /interview|hiring|careers?|jobs?|join/i;
// Page *content* must actually describe a process before it changes the prompts.
const PROCESS_RE = /interview process|hiring process|how we hire|take-?home|system design|onsite|on-site|technical screen|recruiter (call|screen)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeError(err) {
  const cause = err.cause?.code || err.cause?.message || "";
  return cause ? `${err.message} (${cause})` : err.message;
}

// Drop the #fragment so /careers and /careers#team are one page.
function normalize(url) {
  const u = new URL(url);
  u.hash = "";
  return u.href;
}

function scoreLink(link) {
  const { pathname } = new URL(link.url);
  if (NEGATIVE.test(pathname)) return -1;
  const target = `${pathname} ${link.text}`;
  let score = 0;
  for (const [re, pts] of KEYWORDS) if (re.test(target)) score += pts;
  return score;
}

// Follows redirects by hand (max 3) and re-validates every hop.
// null = no usable robots.txt = no restrictions.
async function loadRobots(origin) {
  let url = new URL("/robots.txt", origin).href;
  try {
    for (let hop = 0; hop < 3; hop++) {
      await assertSafeUrl(url);
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url).href;
        continue;
      }
      if (!res.ok) return null;
      if (Number(res.headers.get("content-length")) > ROBOTS_MAX_BYTES) return null;
      const body = (await res.text()).slice(0, ROBOTS_MAX_BYTES);
      return robotsParser(url, body);
    }
  } catch {
    /* fall through */
  }
  return null;
}

const isLocalHost = (h) => h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":");
const siteKey = (h) => h.split(".").slice(-2).join(".");
function sameSite(a, b) {
  if (a.origin === b.origin) return true;
  if (isLocalHost(a.hostname) || isLocalHost(b.hostname)) return false;
  if (ATS_HOSTS.test(a.hostname)) return true;
  return siteKey(a.hostname) === siteKey(b.hostname);
}

function unreachableResult(url, reason) {
  return {
    pages: [],
    hiringPages: [],
    careersPages: [],
    hiringProcessPages: [],
    skipped: [{ url: String(url), reason }],
    unreachable: true,
  };
}

async function crawlSite(startUrl) {
  const t0 = Date.now();
  let start;
  try {
    start = new URL(startUrl);
  } catch {
    return unreachableResult(startUrl, "INVALID_URL");
  }

  const robotsCache = new Map();
  const allowed = async (url) => {
    const { origin } = new URL(url);
    if (!robotsCache.has(origin)) robotsCache.set(origin, await loadRobots(origin));
    const robots = robotsCache.get(origin);
    return !robots || robots.isAllowed(url, BOT) !== false;
  };

  if (!(await allowed(start.href))) {
    return unreachableResult(start.href, "ROBOTS_DISALLOWED");
  }

  const pages = [];
  const skipped = [];
  const seen = new Set([normalize(start.href)]);

  let first;
  try {
    first = await fetchPage(start.href);
  } catch (err) {
    return unreachableResult(start.href, describeError(err));
  }
  pages.push(first);
  seen.add(normalize(first.url));

  const base = new URL(first.url);

  const queue = [];
  const enqueue = (page) => {
    for (const link of page.links || []) {
      try {
        const u = new URL(link.url);
        const key = normalize(link.url);
        if (!sameSite(u, base) || seen.has(key)) continue;
        const score = scoreLink(link);
        if (score > 0) queue.push({ url: key, score });
      } catch {
        /* malformed href: ignore */
      }
    }
  };
  enqueue(first);

  while (queue.length && pages.length < MAX_PAGES && Date.now() - t0 < CRAWL_BUDGET_MS) {
    queue.sort((a, b) => b.score - a.score);
    const { url } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    if (!(await allowed(url))) {
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

  if (queue.length && Date.now() - t0 >= CRAWL_BUDGET_MS) {
    skipped.push({ url: base.origin, reason: "CRAWL_TIME_BUDGET_REACHED" });
  }

  // careersPages: URL/title looks like hiring. hiringProcessPages: content actually describes a process.
  // Only hiringProcessPages should change system-design / company-fit prompts.
  const careersPages = pages
    .filter((p) => CAREERS_RE.test(`${new URL(p.url).pathname} ${p.title || ""}`))
    .map((p) => p.url);
  const hiringProcessPages = pages
    .filter((p) => PROCESS_RE.test(`${p.title || ""} ${p.text || ""}`))
    .map((p) => p.url);
  const hiringPages = [...new Set([...careersPages, ...hiringProcessPages])];

  return { pages, hiringPages, careersPages, hiringProcessPages, skipped, unreachable: false };
}

module.exports = { crawlSite, scoreLink };