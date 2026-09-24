const { fetchPage } = require("../services/retrieval/fetchPage");

fetchPage(process.argv[2])
  .then((p) => console.log(p.title, "|", p.text.length, "chars |", p.links.length, "links"))
  .catch((e) => console.error("FAILED:", e.message));