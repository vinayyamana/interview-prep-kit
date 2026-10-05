const { fetchPage } = require("../services/retrieval/fetchPage");

fetchPage(process.argv[2])
  .then((p) => {
    console.log(p.title, "|", p.text.length, "chars |", p.links.length, "links");
    console.log(p.text.slice(0, 500));
  })