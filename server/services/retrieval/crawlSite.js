const { fetchPage } = require("./fetchPage");

const MAX_PAGES = 8;
const DELAY_MS = 500;
const UA = "InterviewPrepKitBot";

// [pattern, points]: higher score = more likely to describe hiring
const KEYWORDS = [
  [/interview|hiring[-_ ]?process|how[-_ ]we[-_ ]hire|recruit/i, 10],
  [/careers?|jobs?|join|work[-_ ]with[-_ ]us|hiring/i, 8],
  [/handbook|culture|values|principles/i, 5],
  [/engineering|tech|team|about|company|who[-_ ]we[-_ ]are|mission/i, 3],
  [/blog|press|news/i, 1],
];
const NEGATIVE = /login|signin|sign-in|signup|cart|privacy|terms|cookie|\.(pdf|zip|png|jpe?g|gif|svg|css|js)(\?|$)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      if (key === "user-agent") applies = val === "*" || UA.toLowerCase().startsWith(val.toLowerCase());
      else if (key === "disallow" && applies && val) disallow.push(val);
    }
    return disallow;
  } catch {
    return [];
  }
}

async function crawlSite(startUrl) {
  const start = new URL(startUrl);
  const disallow = await loadRobots(start.origin);
  const pages = [];
  const skipped = [];
  const seen = new Set([start.href]);

  let first;
  try {
    first = await fetchPage(start.href);
  } catch (err) {
    throw new Error(`COMPANY_UNREACHABLE: ${err.message}`);
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
      skipped.push({ url, reason: err.message });
    }
  }

  const hiringPages = pages
    .filter((p) => /interview|hiring|careers?|jobs?|join/i.test(`${new URL(p.url).pathname} ${p.title}`))
    .map((p) => p.url);

  return { pages, hiringPages, skipped };
}

module.exports = { crawlSite, scoreLink };