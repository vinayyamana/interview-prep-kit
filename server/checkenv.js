require('dotenv').config();
console.log("KEY:", JSON.stringify(process.env.GEMINI_API_KEY));
console.log("LENGTH:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : "undefined");