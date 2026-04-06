require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const apiKey = process.env.GOOGLE_API_KEY || process.env.AI_STUDIO_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
async function run() {
  try {
     const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey);
     const data = await response.json();
     console.log(data.models.map(m => m.name));
  } catch (e) {
     console.log(e);
  }
}
run();
