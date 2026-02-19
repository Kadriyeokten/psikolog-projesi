const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const JWT_SECRET = "my_super_secret_key_123";
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

db.query("SELECT current_database()", (err, res) => {
  if (err) console.error("DB Hata:", err);
  else console.log("Bağli DB:", res.rows[0].current_database);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// JSON okumak için
app.use(express.static("public"));
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

app.get("/api/site-content", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM site_content WHERE id = 1");

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB Site-content Error" });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    // Mail var mi
    const userCheck = await db.query("SELECT * FROM users WHERE email=$1", [
      email,
    ]);

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Bu mail kayitli" });
    }

    // Şifre hash
    const hashed = await bcrypt.hash(password, 10);

    await db.query("INSERT INTO users(name,email,password) VALUES($1,$2,$3)", [
      name,
      email,
      hashed,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Signup Hata:", err);
    res.status(500).json({ error: "Sunucu hatasi" });
  }
});
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);

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
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "1d" },
  );

  res.json({
    token,
    role: user.role,
    name: user.name,
  });
});

//ABOUT UPDATE
app.post(
  "/api/site-content/about",
  upload.single("image"),
  async (req, res) => {
    try {
      console.log("BODY:", req.body);
      console.log("FILE:", req.file);

      let imagePath = null;

      if (req.file) {
        imagePath = "/uploads/" + req.file.filename;
      }

      const {
        about_title,
        about_text,
        feature_title1,
        feature_title2,
        feature_title3,
        feature_desc1,
        feature_desc2,
        feature_desc3,
        feature1,
        feature2,
        feature3,
        feature4,
      } = req.body;

      await db.query(
        `
        UPDATE site_content
        SET
          about_title=$1,
          about_text=$2,
          feature_title1=$3,
          feature_title2=$4,
          feature_title3=$5,
          feature_desc1=$6,
          feature_desc2=$7,
          feature_desc3=$8,
          feature1=$9,
          feature2=$10,
          feature3=$11,
          feature4=$12,
          about_image=$13
        WHERE id=1
      `,
        [
          about_title,
          about_text,
          feature_title1,
          feature_title2,
          feature_title3,
          feature_desc1,
          feature_desc2,
          feature_desc3,
          feature1,
          feature2,
          feature3,
          feature4,
          imagePath,
        ],
      );

      res.json({ success: true });
    } catch (err) {
      console.error("ABOUT UPDATE ERROR:", err);

      res.status(500).json({
        error: "DB About Update Error",
        detail: err.message,
      });
    }
  },
);

//Doktorları getir
app.get("/api/doctors", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM doctors ORDER BY id DESC");

    res.json(result.rows);
  } catch (err) {
    console.error("DOCTOR GET ERROR:", err);

    res.status(500).json({
      error: "Doktor verileri alınamadı",
    });
  }
});

// Doktor ekle (Admin)
app.post("/api/doctors", upload.single("image"), async (req, res) => {
  try {
    console.log("DOCTOR BODY:", req.body);
    console.log("DOCTOR FILE:", req.file);

    const {
      full_name,
      title,
      phone,
      email,
      instagram,
      twitter,
      facebook,
      linkedin,
    } = req.body;

    let imagePath = null;

    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    await db.query(
      `
        INSERT INTO doctors (
          full_name,
          title,
          image_path,
          phone,
          email,
          instagram,
          twitter,
          facebook,
          linkedin
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        full_name,
        title,
        imagePath,
        phone,
        email,
        instagram,
        twitter,
        facebook,
        linkedin,
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("DOCTOR INSERT ERROR:", err);

    res.status(500).json({
      error: "Doktor ekleme hatası",
      detail: err.message,
    });
  }
});

//Doctor Delete

app.delete("/api/doctors/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM doctors WHERE doctor_id = ?", [id]);
    res.json({ message: "Doktor silindi" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Doktor Silme hatası" });
  }
});
