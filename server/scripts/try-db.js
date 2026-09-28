import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected successfully!");
    console.log("DB name:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();