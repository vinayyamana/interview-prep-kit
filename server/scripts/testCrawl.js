const { crawlSite } = require("../services/retrieval/crawlSite");

crawlSite(process.argv[2])
  .then((r) => {
    console.log("PAGES:", r.pages.map((p) => p.url));
    console.log("HIRING:", r.hiringPages);
    console.log("SKIPPED:", r.skipped);
  })
  .catch((e) => console.error("FAILED:", e.message));