require("dotenv").config();
const { generateJson } = require("../services/llm/client");

generateJson('Return JSON: {"ok": true, "message": "hello"}')
  .then(console.log)
  .catch(console.error);