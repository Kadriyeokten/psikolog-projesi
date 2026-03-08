process.env.TZ = "Europe/Istanbul";
const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const { translate } = require("google-translate-api-x");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const dns = require("dns");

// DNS çözümleme sırasını IPv4 öncelikli yap (Render ENETUNREACH hatası için kritik)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

require("dotenv").config();

const JWT_SECRET = process.env.JWT_SECRET || "my_super_secret_key_123";

// Nodemailer yapılandırması (IPv4 zorlaması ve Port 465 SSL)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s/g, "") : "",
  },
  family: 4, 
  connectionTimeout: 20000, 
  greetingTimeout: 20000, 
  socketTimeout: 20000,
  debug: true,
  logger: true
});

// E-posta bağlantısını başlangıçta test et
transporter.verify((error, success) => {
  if (error) {
    console.error("E-POSTA AYARLARI HATALI (Transporter Verify):", error);
  } else {
    console.log("E-posta sunucusu bağlantısı başarılı! ✅");
  }
});

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const { initWhatsAppBot, getStatus } = require("./whatsapp-bot");

const app = express();
const PORT = process.env.PORT || 3000;

// Render/Proxy güvenliği için trust proxy ayarı (Rate limit uyarısını çözer)
app.set("trust proxy", 1);

// Güvenlik: CORS (Cross-Origin Resource Sharing) - Sadece kendi domaininize izin verin
// Canlıya aldığınızda origin kısmına kendi web sitenizin URL'sini ekleyebilirsiniz. (Örn: 'https://psikolog-projesi.onrender.com')
app.use(cors({
  origin: "*", // Geliştirme aşamasında herkese açık, canlıda sadece kendi alan adınızı yazın.
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Güvenlik: HTTP Başlıklarını Korumak İçin Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Frontend'de inline script veya harici resimler kullanıldığı için CSP'yi şimdilik esnek bırakıyoruz
}));

// Güvenlik: DDoS ve Brute Force Koruması (Rate Limiting)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 150, // Her IP için 15 dakikada maksimum istek
  message: { error: "Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5, // Giriş denemesini 5 ile sınırla (Brute Force engellemesi)
  message: { error: "Çok fazla başarısız giriş denemesi. Lütfen 15 dakika bekleyin." }
});

// JSON okumak için
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Güvenlik: Girdi Temizleme (Sanitization) - XSS Koruması
// Kullanıcıdan gelen JSON verilerinin içindeki tehlikeli HTML etiketlerini (script vb.) temizler.
const sanitizeInput = (obj) => {
  for (let key in obj) {
    if (typeof obj[key] === 'string') {
      // Tehlikeli karakterleri zararsız HTML kodlarına dönüştür
      obj[key] = obj[key].replace(/</g, "&lt;").replace(/>/g, "&gt;");
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeInput(obj[key]);
    }
  }
};

app.use((req, res, next) => {
  if (req.body) sanitizeInput(req.body);
  if (req.query) sanitizeInput(req.query);
  if (req.params) sanitizeInput(req.params);
  next();
});

// Tüm API isteklerine genel sınır koy
app.use("/api/", generalLimiter);

const QRCode = require('qrcode'); // Kütüphaneyi ekliyoruz

// WhatsApp QR Sayfası
app.get("/qr", async (req, res) => {
  const status = getStatus();
  let qrImage = '';
  
  if (status.qr) {
    try {
      qrImage = await QRCode.toDataURL(status.qr);
    } catch (err) {
      console.error("QR Image Error:", err);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Bot Bağlantısı</title>
      <meta http-equiv="refresh" content="5"> <!-- Sayfayı her 5 saniyede bir otomatik yenile -->
      <style>
        body { font-family: sans-serif; text-align: center; padding: 50px; background: #f0f2f5; }
        .card { background: white; padding: 30px; border-radius: 10px; display: inline-block; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .qr-img { margin: 20px auto; border: 10px solid white; border-radius: 5px; box-shadow: 0 0 5px rgba(0,0,0,0.1); }
        .status { margin-top: 20px; font-weight: bold; }
        .connected { color: #25d366; }
        .waiting { color: #ff9800; }
        .btn-refresh { margin-top: 20px; padding: 10px 20px; cursor: pointer; background: #25d366; color: white; border: none; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>WhatsApp Bot Bağlantısı</h2>
        ${status.connected 
          ? '<h3 class="status connected">✅ BAĞLANTI BAŞARILI!</h3>' 
          : status.qr 
            ? '<p>Lütfen bu QR kodu telefonunuzdan taratın.</p><img class="qr-img" src="' + qrImage + '" width="300" /><div class="status waiting">QR kod okutulmayı bekliyor...</div>'
            : '<div class="status waiting">QR kod bekleniyor, lütfen sayfayı yenileyin...</div>'
        }
        <br/>
        <button class="btn-refresh" onclick="location.reload()">Sayfayı Yenile</button>
      </div>
    </body>
    </html>
  `);
});

// API Durum
app.get("/api/whatsapp/status", (req, res) => {
  res.json(getStatus());
});

db.query("SELECT current_database()", (err, res) => {
  if (err) console.error("DB Hata:", err);
  else {
    console.log("Bağli DB:", res.rows[0].current_database);
    // OTOMATIK SÜTUN KONTROLÜ (RENDER FIX)
    ensureColumnsExist();
  }
});

async function ensureColumnsExist() {
  try {
    console.log("Veritabanı sütun kontrolü yapılıyor...");
    
    // Users tablosu kontrolü
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        reset_token VARCHAR(255),
        reset_token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Users tablosu için eksik sütunlar (Render/Existing Table fix)
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP`);

    // Site Content - whatsapp_number
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)`);
    // Doctors - bio
    await db.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT`);
    // Ensure ID=1 exists in site_content
    const res = await db.query("SELECT id FROM site_content WHERE id = 1");
    if (res.rowCount === 0) {
      await db.query("INSERT INTO site_content (id, about_title) VALUES (1, 'Hakkımızda')");
    }
    console.log("Veritabanı sütunları doğrulandı.");
  } catch (err) {
    console.error("Sütun doğrulama hatası:", err.message);
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Güvenlik: Yalnızca Resim Dosyalarına İzin Veren Filtre
const imageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("Güvenlik İhlali: Sadece resim formatları (.png, .jpg, .jpeg, .webp) yüklenebilir!"));
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Güvenlik: Maksimum 5MB limit
  fileFilter: imageFilter
});

// JSON okumak için
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public klasörünü aç
app.use(express.static(path.join(__dirname, "../public")));

// JWT Admin Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Erişim reddedildi. Lütfen giriş yapın." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Geçersiz veya süresi dolmuş oturum." });
    if (user.role !== 'admin') return res.status(403).json({ error: "Bu işlem için admin yetkisi gerekiyor." });
    
    req.user = user;
    next();
  });
}

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

  console.log("Gelen Randevu Verileri:", req.body); // Debug: Gelen veriyi logla

  if (!patientName || !patientPhone || !service || !therapist || !selectedDateTime) {
    console.log("Hata: Eksik randevu verisi."); // Debug: Eksik veriyi logla
    return res.status(400).json({ error: "Lütfen gerekli tüm alanları doldurun." });
  }

  try {
    console.log("Veritabanına eklenecek veriler:", [patientName, patientPhone, patientEmail, service, therapist, selectedDateTime]); // Debug: Eklenecek veriyi logla
    const result = await db.query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [patientName, patientPhone, patientEmail, service, therapist, selectedDateTime]
    );
    console.log("Randevu başarıyla oluşturuldu:", result.rows[0]); // Debug: Başarılı oluşturmayı logla
    res.json({ message: "Randevunuz başarıyla oluşturuldu.", appointment: result.rows[0] });
  } catch (err) {
    console.error("Randevu oluşturma hatası (DB):", err); // Debug: DB hatasını logla
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
        textColor: "#ffffff",
        overlap: false // Diğer seçimlerin bunun üzerine binmesini engeller
      };
    });
    res.json(bookedEvents);
  } catch (err) {
    console.error("Dolu saatleri getirme hatası:", err);
    res.status(500).json({ error: "Dolu saatler getirilemedi." });
  }
});

// Tüm Randevuları Getir (GET - Admin İçin)
app.get("/api/appointments", authenticateAdmin, async (req, res) => {
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
app.put("/api/appointments/:id/status", authenticateAdmin, async (req, res) => {
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
app.delete("/api/appointments/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM appointments WHERE id = $1", [id]);
    res.json({ message: "Randevu silindi." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Randevu silinemedi" });
  }
});

// ==========================================
// TRANSLATION API (AUTO-TRANSLATE)
// ==========================================

app.post("/api/translate", async (req, res) => {
  const { text, target } = req.body;

  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    const result = await translate(text, { to: target || 'en' });
    const translatedText = result.text;

    // Cache it in the en.json file automatically
    if (target === 'en' || !target) {
      const enPath = path.join(__dirname, "../public/assets/locales/en.json");
      if (fs.existsSync(enPath)) {
        const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
        if (!enData[text]) {
          enData[text] = translatedText;
          fs.writeFileSync(enPath, JSON.stringify(enData, null, 2));
        }
      }
    }

    res.json({ translatedText });
  } catch (err) {
    console.error("Translation Error:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server çalisiyor: http://localhost:${PORT}`);
  initWhatsAppBot();
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
app.post("/api/login", loginLimiter, async (req, res) => {
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

// Şifremi Unuttum - Token Oluştur ve Mail Gönder
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000); // 1 saat geçerli

    await db.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3",
      [token, expiry, email]
    );

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password.html?token=${token}`;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error("E-POSTA AYARLARI EKSİK! (EMAIL_USER veya EMAIL_PASS yok)");
        return res.status(500).json({ error: "Sunucu e-posta ayarları yapılmamış. Lütfen yönetici ile iletişime geçin." });
    }

    const mailOptions = {
      from: `"Fast Terapi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Şifre Yenileme Talebi - Fast Terapi",
      text: `Şifrenizi yenilemek için şu bağlantıya tıklayın: ${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #25d366;">Şifre Yenileme Talebi</h2>
          <p>Aşağıdaki bağlantıya tıklayarak şifrenizi yenileyebilirsiniz. Bu bağlantı 1 saat boyunca geçerlidir.</p>
          <div style="margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #25d366; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Şifremi Yenile</a>
          </div>
          <p>Eğer bu talebi siz yapmadıysanız lütfen bu e-postayı dikkate almayın.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin-top: 30px;">
          <p style="color: #888; font-size: 12px;">Bu e-posta Fast Terapi sistemi tarafından otomatik olarak gönderilmiştir.</p>
        </div>
      `,
    };

    console.log(`E-posta gönderimi başlatıldı: ${email}...`);
    
    // E-posta gönderimi (30 saniye zaman aşımı ile)
    await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error("E-posta gönderimi zaman aşımına uğradı (30s)")), 30000))
    ]);

    console.log("E-posta başarıyla gönderildi! ✅");
    res.json({ message: "Şifre yenileme bağlantısı e-posta adresinize gönderildi." });
  } catch (err) {
    console.error("FORGOT PASSWORD DETAYLI HATA:", {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ error: "Bir hata oluştu, lütfen daha sonra tekrar deneyin.", detail: err.message });
  }
});

// Şifre Yenileme - Yeni Şifreyi Kaydet
app.post("/api/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const userResult = await db.query(
      "SELECT * FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()",
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Geçersiz veya süresi dolmuş bağlantı." });
    }

    const email = userResult.rows[0].email;
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE email = $2",
      [hashedPassword, email]
    );

    res.json({ message: "Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Bir hata oluştu, lütfen daha sonra tekrar deneyin." });
  }
});

//ABOUT UPDATE
app.post(
  "/api/site-content/about",
  authenticateAdmin,
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
        whatsapp_number,
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
          about_image=COALESCE($13, about_image),
          whatsapp_number=$14
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
          whatsapp_number,
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

// General Settings Update
app.post("/api/site-content/settings", authenticateAdmin, async (req, res) => {
  const { whatsapp_number } = req.body;
  try {
    const result = await db.query(
      "UPDATE site_content SET whatsapp_number = $1 WHERE id = 1 RETURNING *",
      [whatsapp_number]
    );
    if (result.rowCount === 0) {
      await db.query("INSERT INTO site_content (id, whatsapp_number) VALUES (1, $1)", [whatsapp_number]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("SETTINGS UPDATE ERROR:", err);
    // Hata mesajını detayıyla dönelim ki Render'da ne olduğunu görebilelim
    res.status(500).json({ error: "Sunucu hatası", detail: err.message, code: err.code });
  }
});

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
app.post("/api/doctors", authenticateAdmin, upload.single("image"), async (req, res) => {
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
app.delete("/api/doctors/:id", authenticateAdmin, async (req, res) => {
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
app.put("/api/doctors/:id", authenticateAdmin, upload.single("image"), async (req, res) => {
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
app.post("/api/services", authenticateAdmin, upload.single("image"), async (req, res) => {
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
app.put("/api/services/:id", authenticateAdmin, upload.single("image"), async (req, res) => {
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
app.delete("/api/services/:id", authenticateAdmin, async (req, res) => {
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
