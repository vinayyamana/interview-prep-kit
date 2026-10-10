const robotsParser = require("robots-parser");
const { fetchPage } = require("./fetchPage");
const { assertSafeUrl } = require("../security/validateUrl");

const MAX_PAGES = 8;
const DELAY_MS = 500;
const UA = "Mozilla/5.0 (compatible; InterviewPrepKitBot/1.0)";
const BOT = "InterviewPrepKitBot"; // token matched against robots.txt User-agent lines

// [pattern, points]: higher score = more likely to describe hiring
const KEYWORDS = [
  [/interview|hiring[-_ ]?process|how[-_ ]we[-_ ]hire|recruit/i, 10],
  [/careers?|jobs?|join|work[-_ ]with[-_ ]us|hiring/i, 8],
  [/handbook|culture|values|principles/i, 2],
  [/engineering|tech|team|about|company|who[-_ ]we[-_ ]are|mission/i, 3],
  [/blog|press|news/i, 1],
];

// Tested against the URL *path only*. Testing the full URL made companies with
// "login", "cart" or "cookie" in their domain lose every link.
const NEGATIVE =
  /(^|[\/_-])(log-?in|sign-?(in|up)|cart|privacy|terms|cookies?|edit|ide|blob|raw|commits?|merge_requests|issues|compare|tree)([\/_.-]|$)|\.(pdf|zip|png|jpe?g|gif|svg|css|js)$/i;
  

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeError(err) {
  const cause = err.cause?.code || err.cause?.message || "";
  return cause ? `${err.message} (${cause})` : err.message;
}

function scoreLink(link) {
  const { pathname } = new URL(link.url);
  if (NEGATIVE.test(pathname)) return -1;
  const target = `${pathname} ${link.text}`;
  let score = 0;
  for (const [re, pts] of KEYWORDS) if (re.test(target)) score += pts;
  return score;
}

// robots.txt is fetched only after the origin passes URL validation.
// null = no usable robots.txt = no restrictions.
async function loadRobots(origin) {
  try {
    await assertSafeUrl(origin);
    const robotsUrl = new URL("/robots.txt", origin).href;
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? robotsParser(robotsUrl, await res.text()) : null;
  } catch {
    return null;
  }
}

// Same site = same origin, or (for real domains only) same registrable domain,
// so a handbook on a sibling subdomain is reachable. Naive for .co.uk-style domains.
const isLocalHost = (h) => h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":");
const siteKey = (h) => h.split(".").slice(-2).join(".");
function sameSite(a, b) {
  if (a.origin === b.origin) return true;
  if (isLocalHost(a.hostname) || isLocalHost(b.hostname)) return false;
  return siteKey(a.hostname) === siteKey(b.hostname);
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

  // robots.txt differs per origin, so cache one parser per origin.
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
  const seen = new Set([start.href]);

  // fetchPage already retries with backoff, so no extra retry layer here.
  let first;
  try {
    first = await fetchPage(start.href);
  } catch (err) {
    return unreachableResult(start.href, describeError(err));
  }
  pages.push(first);
  seen.add(first.url);

  // Compare against the final URL: the start page may have redirected (http -> https, www).
  const base = new URL(first.url);

  const queue = [];
  const enqueue = (page) => {
    for (const link of page.links) {
      const u = new URL(link.url);
      if (!sameSite(u, base) || seen.has(link.url)) continue;
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

  const hiringPages = pages
    .filter((p) => /interview|hiring|careers?|jobs?|join/i.test(`${new URL(p.url).pathname} ${p.title}`))
    .map((p) => p.url);

  return { pages, hiringPages, skipped, unreachable: false };
}

module.exports = { crawlSite, scoreLink };