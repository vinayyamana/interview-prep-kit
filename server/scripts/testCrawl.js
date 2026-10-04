const { crawlSite } = require("../services/retrieval/crawlSite");

crawlSite(process.argv[2])
  .then((r) => {
    console.log("PAGES:", r.pages.map((p) => `${p.url} (${(p.text || "").length} chars)`));
    console.log("TEXT:", JSON.stringify(r.pages[0] && r.pages[0].text));
    console.log("HIRING:", r.hiringPages);
    console.log("SKIPPED:", r.skipped);
  })
  .catch((e) => console.error("FAILED:", e.message));