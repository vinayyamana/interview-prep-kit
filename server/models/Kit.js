const crypto = require("crypto");
const mongoose = require("mongoose");

const FINAL_STATUSES = ["done", "failed"];

const kitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "crawling", "researching", "generating", "checking-coverage", "done", "failed"],
      default: "queued",
    },
    // Human-readable progress line shown in the UI while generating
    progress: { type: String, default: "" },
    // Hash of (jd + company url + days). Used to stop duplicate submissions.
    inputHash: { type: String },
    // Bumped on every user edit/save. Client sends the version it saw;
    // a mismatch means someone else (or a regeneration) changed the kit.
    version: { type: Number, default: 0 },
    error: { type: Object, default: null },
    data: { type: Object, default: null },
  },
  { timestamps: true, minimize: false }
);

// One kit per user per identical input.
kitSchema.index(
  { userId: 1, inputHash: 1 },
  { unique: true, partialFilterExpression: { inputHash: { $type: "string" } } }
);

kitSchema.statics.hashInput = function ({ jd, companyUrl, days }) {
  const normalised = [
    String(jd || "").trim().replace(/\s+/g, " ").toLowerCase(),
    String(companyUrl || "").trim().toLowerCase().replace(/\/+$/, ""),
    Number(days),
  ].join("|");
  return crypto.createHash("sha256").update(normalised).digest("hex");
};

// Call once on server startup: any kit left mid-generation by a crash/restart
// would otherwise spin forever in the UI.
kitSchema.statics.failStuckJobs = async function () {
  const res = await this.updateMany(
    { status: { $nin: FINAL_STATUSES } },
    {
      $set: {
        status: "failed",
        progress: "",
        error: { code: "INTERRUPTED", message: "Generation was interrupted by a server restart. Please retry." },
      },
    }
  );
  return res.modifiedCount || 0;
};

module.exports = mongoose.model("Kit", kitSchema);
module.exports.FINAL_STATUSES = FINAL_STATUSES;