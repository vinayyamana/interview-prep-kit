const cheerio = require("cheerio");
const { fetch } = require("undici");
const { cleanText, dedupeSentences } = require("./cleanText");
const { assertSafeUrl, safeAgent } = require("../security/validateUrl");

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 10_000;
const UA = "InterviewPrepKitBot/1.0";

// Same error messages as before, backed by the strict checker.
async function validateUrl(raw) {
  try {
    return await assertSafeUrl(raw);
  } catch (err) {
    const msg =
      err.code === "URL_BLOCKED" ? "PRIVATE_ADDRESS" : err.code || err.message;
    const e = new Error(msg);
    e.code = err.code;
    e.detail = err.message;
    throw e;
  }
}

async function readLimited(res) {
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
  // Take links first, the careers link is usually in nav/footer
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href"), url);
      abs.hash = "";
      if (["http:", "https:"].includes(abs.protocol)) {
        links.push({ url: abs.href, text: $(el).text().trim().slice(0, 100) });
      }
    } catch {}
  });

  const title = $("title").text().trim();
  // Cleaned text first, fall back to the old method if empty
  let text = dedupeSentences(cleanText(html));
  if (!text) {
    $("script, style, noscript, svg, nav, footer").remove();
    text = $("body").text().replace(/\s+/g, " ").trim();
  }
  return { url: url.href, title, text: text.slice(0, 20000), links };
}

async function fetchPageOnce(rawUrl) {
  let url = await validateUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetch(url, {
        redirect: "manual",
        dispatcher: safeAgent,
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err.cause && err.cause.code === "URL_BLOCKED") {
        throw new Error("PRIVATE_ADDRESS");
      }
      throw err;
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await validateUrl(new URL(location, url).href);
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

async function fetchPage(url, retries = 2) {
  for (let i = 0; ; i++) {
    try {
      return await fetchPageOnce(url);
    } catch (err) {
      const retryable = /HTTP_(429|5\d\d)|TimeoutError|fetch failed/.test(
        `${err.name} ${err.message}`
      );
      if (i >= retries || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

module.exports = { fetchPage, validateUrl };