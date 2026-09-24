const cheerio = require("cheerio");
const dns = require("dns").promises;
const net = require("net");

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;
const UA = "InterviewPrepKitBot/1.0";

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === "::1" || /^(fc|fd|fe80)/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

async function validateUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_URL");
  // Private/loopback hosts are blocked in production only, so local test sites still work.
  if (process.env.NODE_ENV === "production") {
    const { address } = await dns.lookup(url.hostname);
    if (isPrivateIp(address)) throw new Error("PRIVATE_ADDRESS");
  }
  return url;
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
  $("a[href]").each((_, el) => {
    try {
      const abs = new URL($(el).attr("href"), url);
      abs.hash = "";
      if (["http:", "https:"].includes(abs.protocol)) {
        links.push({ url: abs.href, text: $(el).text().trim().slice(0, 100) });
      }
    } catch {}
  });
  $("script, style, noscript, svg, nav, footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20000);
  return { url: url.href, title: $("title").text().trim(), text, links };
}

async function fetchPageOnce(rawUrl) {
  let url = await validateUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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
      const retryable = /HTTP_(429|5\d\d)|TimeoutError|fetch failed/.test(`${err.name} ${err.message}`);
      if (i >= retries || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

module.exports = { fetchPage, validateUrl };