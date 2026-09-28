const mongoose = require("mongoose");

const kitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["queued", "crawling", "researching", "generating", "checking-coverage", "done", "failed"],
      default: "queued",
    },
    error: { type: Object, default: null },
    data: { type: Object, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Kit", kitSchema);