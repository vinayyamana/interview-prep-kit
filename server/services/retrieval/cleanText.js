const cheerio = require("cheerio");

function cleanText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer, form, svg, iframe, aside").remove();
  // words anni kalisipokunda spaces pettadam
  $("p, li, h1, h2, h3, h4, div, a, span, br").after(" ");
  const root = $("main").length ? $("main") : $("body");
  return root.text().replace(/\s+/g, " ").trim().slice(0, 8000);
}

function dedupeSentences(text) {
  const seen = new Set();
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 30 && !seen.has(s) && seen.add(s))
    .join(" ");
}

module.exports = { cleanText, dedupeSentences };