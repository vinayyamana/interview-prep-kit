const { validateKit } = require("../kit/kitSchema");
const Kit = require("../models/Kit"); // mee Kit model path (check cheyyandi)

async function saveKit(kit) {
  const result = validateKit(kit);
  if (!result.ok) {
    throw new Error("INVALID_KIT: " + result.errors.join("; "));
  }
  return Kit.create(result.kit);
}

module.exports = { saveKit };
