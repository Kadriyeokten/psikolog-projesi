const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "my_super_secret_key_123";



db.query("SELECT current_database()", (err, res) => {
  if (err) console.error("DB Hata:", err);
  else console.log("Bağli DB:", res.rows[0].current_database);
});


const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// JSON okumak için

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public klasörünü aç
app.use(express.static(path.join(__dirname, "../public")));

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Server başlat
app.listen(PORT, () => {
  console.log(`Server çalisiyor: http://localhost:${PORT}`);
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    // Mail var mi
    const userCheck = await db.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Bu mail kayitli" });
    }

    // Şifre hash
    const hashed = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users(name,email,password) VALUES($1,$2,$3)",
      [name, email, hashed]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("Signup Hata:", err);
    res.status(500).json({ error: "Sunucu hatasi" });
  }
});
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "Kullanıcı bulunamadı" });
  }

  const user = result.rows[0];

  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ error: "Şifre hatalı" });
  }

  // TOKEN içine rol koyuyoruz
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    role: user.role,
    name: user.name
  });
});
