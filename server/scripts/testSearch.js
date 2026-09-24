const { searchDiscussion, companyNameFromUrl, isLocalUrl } = require("../services/retrieval/searchDiscussion");

const url = process.argv[2];
searchDiscussion(companyNameFromUrl(url), { skip: isLocalUrl(url) }).then((r) =>
  console.log(JSON.stringify(r, null, 2))
);
