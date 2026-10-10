const cheerio = require("cheerio");
const { assertSafeUrl } = require("../security/validateUrl");
const { cleanText, dedupeSentences } = require("./cleanText");

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;
const UA = "InterviewPrepKitBot/1.0";

// Reads the body but stops at MAX_BYTES, so a huge page cannot exhaust memory.
async function readLimited(res) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parsePage(html, url) {
  const $ = cheerio.load(html);
  const links = [];
  // Links mundu teesukovali, careers link nav/footer lo untundi
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href"), url); // relative links resolve against the page URL
      abs.hash = "";
      if (["http:", "https:"].includes(abs.protocol)) {
        links.push({ url: abs.href, text: $(el).text().trim().slice(0, 100) });
      }
    } catch {}
  });

  const title = $("title").text().trim();
  // Cleaned text, kani empty aite pata method ki fallback
  let text = dedupeSentences(cleanText(html));
  if (!text) {
    $("script, style, noscript, svg, nav, footer").remove();
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  return { url: url.href, title, text: text.slice(0, 20000), links };
}

async function fetchPageOnce(rawUrl) {
  // Every hop (first URL and each redirect) goes through the same SSRF check.
  let url = await assertSafeUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      res.body?.cancel().catch(() => {});
      url = await assertSafeUrl(new URL(location, url).href);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    if (!(res.headers.get("content-type") || "").includes("text/html")) {
      throw new Error("UNSUPPORTED_CONTENT_TYPE");
    }
    return parsePage(await readLimited(res), url);
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

// Retries only transient failures (429, 5xx, timeout, network) with exponential backoff.
async function fetchPage(url, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      return await fetchPageOnce(url);
    } catch (err) {
      const retryable = /HTTP_(429|5\d\d)|TimeoutError|fetch failed/.test(`${err.name} ${err.message}`);
      if (i >= retries || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

// validateUrl alias kept so existing imports of it keep working.
module.exports = { fetchPage, validateUrl: assertSafeUrl };