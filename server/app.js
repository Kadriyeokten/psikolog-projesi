const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// JSON okumak için
app.use(express.json());

// Public klasörünü aç
app.use(express.static(path.join(__dirname, "../public")));

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Server başlat
app.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
