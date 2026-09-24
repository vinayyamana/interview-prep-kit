require("dotenv").config();
const { extractRequirements } = require("../services/extract/requirements");

const jd = `Senior Backend Engineer
Required: 5+ years with Node.js, strong MongoDB experience.
You will mentor junior engineers.
Bonus points for Kubernetes experience.`;

extractRequirements(jd)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch(console.error);