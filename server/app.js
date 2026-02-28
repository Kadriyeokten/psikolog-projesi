const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "my_super_secret_key_123";
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

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
// ==========================================
// APPOINTMENTS API
// ==========================================

// Randevu Al (POST)
app.post("/api/appointments", async (req, res) => {
  const { patientName, patientPhone, patientEmail, service, therapist, selectedDateTime } = req.body;

  if (!patientName || !patientPhone || !service || !therapist || !selectedDateTime) {
    return res.status(400).json({ error: "Lütfen gerekli tüm alanları doldurun." });
  }

  try {
    const result = await db.query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [patientName, patientPhone, patientEmail, service, therapist, selectedDateTime]
    );
    res.json({ message: "Randevunuz başarıyla oluşturuldu.", appointment: result.rows[0] });
  } catch (err) {
    console.error("Randevu oluşturma hatası:", err);
    res.status(500).json({ error: "Randevu oluşturulamadı." });
  }
});

// Takvim İçin Dolu Saatleri Getir (GET - Müşteriler İçin)
app.get("/api/appointments/booked", async (req, res) => {
  try {
    const result = await db.query(`SELECT appointment_date FROM appointments`);
    const bookedEvents = result.rows.map(row => {
      // Randevuyu 1 saatlik dolu bir blok olarak takvime gönderiyoruz
      const start = new Date(row.appointment_date);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 saat eklendi
      return {
        title: "Dolu",
        start: start.toISOString(),
        end: end.toISOString(),
        color: "#ff0000", // Kırmızı renk
        display: "background" // Tıklanmayı engellemek için arka plan eventi yapıyoruz
      };
    });
    res.json(bookedEvents);
  } catch (err) {
    console.error("Dolu saatleri getirme hatası:", err);
    res.status(500).json({ error: "Dolu saatler getirilemedi." });
  }
});

// Tüm Randevuları Getir (GET - Admin İçin)
app.get("/api/appointments", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        a.id, a.patient_name, a.patient_phone, a.patient_email, a.appointment_date, a.status, a.created_at,
        s.title as service_name,
        d.full_name as doctor_name
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      ORDER BY a.appointment_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Randevuları getirme hatası:", err);
    res.status(500).json({ error: "Randevular getirilemedi." });
  }
});

// Randevu Durumunu Güncelle (PUT - Admin İçin)
app.put("/api/appointments/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await db.query(
      "UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Durum güncellenemedi" });
  }
});

// Randevu Sil (DELETE - Admin İçin)
app.delete("/api/appointments/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM appointments WHERE id = $1", [id]);
    res.json({ message: "Randevu silindi." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Randevu silinemedi" });
  }
});

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
          about_image=COALESCE($13, about_image)
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
    const {
      full_name,
      title,
      phone,
      email,
      instagram,
      twitter,
      facebook,
      linkedin,
      is_active,
      bio,
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
          linkedin,
          is_active,
          bio
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
        is_active === "true" || is_active === true,
        bio,
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
  const id = parseInt(req.params.id);

  try {
    const result = await db.query(
      "DELETE FROM doctors WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Doktor bulunamadı" });
    }

    res.json({ message: "Doktor silindi" });
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

//Doctor update
app.put("/api/doctors/:id", upload.single("image"), async (req, res) => {
  try {
    const id = req.params.id;
    const {
      full_name,
      title,
      phone,
      email,
      instagram,
      twitter,
      facebook,
      linkedin,
      is_active,
      bio,
    } = req.body;

    let imagePath = null;
    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    await db.query(
      `UPDATE doctors 
       SET full_name=$1, 
           title=$2, 
           image_path=COALESCE($3, image_path), 
           phone=$4, 
           email=$5, 
           instagram=$6, 
           twitter=$7, 
           facebook=$8, 
           linkedin=$9,
           is_active=$10,
           bio=$11,
           updated_at=NOW()
       WHERE id=$12`,
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
        is_active === "true" || is_active === true,
        bio,
        id,
      ],
    );

    res.json({ success: true, message: "Güncellendi" });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: "Güncelleme başarısız", detail: err.message });
  }
});

//id ile doktor getir

app.get("/api/doctors/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM doctors WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Doktor bulunamadı" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

//Service all

// Tüm hizmetleri al
app.get("/api/services", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM services ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmetler alınamadı" });
  }
});

//id service

app.get("/api/services/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM services WHERE id = $1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Hizmet bulunamadı" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet alınamadı" });
  }
});

//insert service
app.post("/api/services", upload.single("image"), async (req, res) => {
  try {
    const { title, dsc } = req.body;
    if (!title || !dsc) return res.status(400).json({ error: "Başlık ve açıklama gerekli" });

    let imagePath = null;
    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    const result = await db.query(
      `INSERT INTO services (title, dsc, image_path) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [title, dsc, imagePath],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet eklenemedi" });
  }
});

// POST yeni hizmet (Tekrarlanan rota kaldırıldı ve üsttekiyle birleştirildi)

// PUT güncelleme (sadece title, dsc ve image_path)
app.put("/api/services/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { title, dsc } = req.body;

  try {
    let imagePath = null;
    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    const result = await db.query(
      `UPDATE services
       SET title = COALESCE($1, title),
           dsc = COALESCE($2, dsc),
           image_path = COALESCE($3, image_path),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [title, dsc, imagePath, id],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Hizmet bulunamadı" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet güncellenemedi" });
  }
});

// DELETE hizmet
app.delete("/api/services/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM services WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Hizmet bulunamadı" });
    res.json({ message: "Hizmet silindi", service: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet silinemedi" });
  }
});
