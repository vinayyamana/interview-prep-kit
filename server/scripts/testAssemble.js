require("dotenv").config();
const { assembleKit } = require("../services/assembleKit");

const jd = `Senior Backend Engineer
Required: 5+ years with Node.js, strong MongoDB experience.
You will mentor junior engineers.
Bonus points for Kubernetes experience.`;

assembleKit({ jd, companyUrl: "https://posthog.com", days: 5 })
  .then((kit) => console.log(JSON.stringify(kit, null, 2)))
  .catch((e) => console.error("FAILED:", e.message));