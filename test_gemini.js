require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const apiKey = process.env.GOOGLE_API_KEY || process.env.AI_STUDIO_API_KEY;
console.log("Using API Key starting with:", apiKey ? apiKey.substring(0, 5) : "none");
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
model.generateContent("Merhaba, çalışıyor musun?").then(res => {
  console.log("Success:", res.response.text());
}).catch(err => {
  console.error("Gemini Error:", err);
});
