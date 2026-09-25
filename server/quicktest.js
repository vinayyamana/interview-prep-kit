require('dotenv').config();

const key = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`;

const body = {
  contents: [{ parts: [{ text: "Say hello in one word." }] }]
};

fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
})
  .then(async (res) => {
    console.log("STATUS:", res.status);
    console.log("BODY:", await res.text());
  })
  .catch((err) => console.error("FETCH ERROR:", err));