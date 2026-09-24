const UA = "InterviewPrepKitBot/1.0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Local test sites (localhost/IP) have no real domain, so use the first path segment.
function companyNameFromUrl(rawUrl) {
  const u = new URL(rawUrl);
  const host = u.hostname.replace(/^www\./, "");
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return u.pathname.split("/").filter(Boolean)[0] || "";
  }
  const parts = host.split(".");
  if (parts.length >= 3 && ["co", "com", "org", "net"].includes(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

// A local address has no real company identity, so a public search would only return noise.
function isLocalUrl(rawUrl) {
  const host = new URL(rawUrl).hostname;
  return host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith(".local");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripHtml(s = "") {
  return s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

async function fetchHits(url, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return (await res.json()).hits || [];
    } catch (err) {
      if (i >= retries) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
}

async function searchDiscussion(company, { skip = false } = {}) {
  if (skip) return { company, results: [], note: "SEARCH_SKIPPED_LOCAL_SITE" };
  if (!company) return { company, results: [], note: "NO_COMPANY_NAME" };

  const q = encodeURIComponent(`${company} interview`);
  const url = `https://hn.algolia.com/api/v1/search?query=${q}&tags=(story,comment)&hitsPerPage=20`;

  let hits;
  try {
    hits = await fetchHits(url);
  } catch (err) {
    // A failed source is reported, never fatal.
    return { company, results: [], note: `SEARCH_UNAVAILABLE: ${err.message}` };
  }

  const nameRe = new RegExp(`\\b${escapeRegExp(company)}\\b`, "i");
  const results = hits
    .map((h) => ({
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: "Hacker News",
      snippet: stripHtml(h.comment_text || h.story_text || h.title || h.story_title).slice(0, 500),
    }))
    .filter((r) => nameRe.test(r.snippet) && /interview|hiring|hire|take-home|onsite|offer/i.test(r.snippet))
    .slice(0, 5);

  return { company, results, note: results.length ? null : "NO_PUBLIC_DISCUSSION_FOUND" };
}

module.exports = { searchDiscussion, companyNameFromUrl, isLocalUrl };