require("dotenv").config();
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
const { Resend } = require("resend");

// DNS çözümleme sırasını IPv4 öncelikli yap (Render ENETUNREACH hatası için kritik)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const JWT_SECRET = process.env.JWT_SECRET || "my_super_secret_key_123";

// Resend yapılandırması (SMTP Port engellemelerini aşmak için HTTP API)
let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("UYARI: RESEND_API_KEY bulunamadı. E-posta gönderimi çalışmayacaktır.");
}

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
  max: 1500, // Test aşamasında 429 hatasını önlemek için 150'den 1500'e çıkarıldı
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

// --- SAAS (MULTI-TENANT) MIDDLEWARE ---
app.use("/api/", async (req, res, next) => {
  const host = req.hostname;
  let subdomain = null;

  // Subdomain yakalama mantığı
  if (host.includes('.localhost')) {
    const parts = host.split('.localhost');
    if (parts[0] !== 'localhost' && parts[0] !== '') subdomain = parts[0];
  } else {
    // Canlı ortam (örn: mavi.fastterapi.com)
    const parts = host.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      subdomain = parts[0];
    }
  }

  // EĞER ALT DOMAİN YOKSA (Ana sitedeyiz demektir)
  if (!subdomain) {
    req.isMainDomain = true;
    req.clinic_id = 1; // Ana domain (Merkez Klinik) ID'si 1'dir
    return next();
  }

  // EĞER ALT DOMAİN VARSA (Klinik sitesindeyiz)
  try {
    const clinicRes = await db.query("SELECT id, name, is_active FROM clinics WHERE subdomain = $1", [subdomain]);
    
    if (clinicRes.rowCount > 0) {
      const clinic = clinicRes.rows[0];
      if (!clinic.is_active) {
        return res.status(403).json({ error: "Bu klinik hesabı dondurulmuştur." });
      }
      req.clinic_id = clinic.id;
      req.clinic_name = clinic.name;
      req.isMainDomain = false;
    } else {
      // Geçersiz subdomain yazıldıysa ana siteye yönlendirebiliriz veya hata verebiliriz
      return res.status(404).json({ error: "Böyle bir klinik bulunamadı." });
    }
  } catch (err) {
    console.error("SaaS Middleware Hatası:", err);
    return res.status(500).json({ error: "Sistem hatası" });
  }
  
  next();
});

// Süper Admin Yetki Kontrolü Middleware
async function authenticateSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.error("Super Admin Auth Error: No token provided");
    return res.status(401).json({ error: "Erişim reddedildi. Token bulunamadı." });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.error("Super Admin Auth Error (JWT Verify):", err.message);
      return res.status(403).json({ error: "Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın." });
    }
    
    try {
      // Veritabanından GÜNCEL rolü kontrol et
      const userResult = await db.query("SELECT id, role, token_version FROM users WHERE id = $1", [decoded.id]);
      
      if (userResult.rows.length === 0) {
        console.error(`Super Admin Auth Error: User ID ${decoded.id} not found`);
        return res.status(403).json({ error: "Kullanıcı bulunamadı." });
      }

      const user = userResult.rows[0];

      if (user.role !== 'superadmin') {
        console.error(`Super Admin Auth Error: User ID ${decoded.id} is not a superadmin (Role: ${user.role})`);
        return res.status(403).json({ error: "Bu işlem için Süper Admin yetkisi gerekiyor." });
      }

      // Opsiyonel: token_version kontrolü (şifre değiştiyse eski tokenlar geçersiz olur)
      if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
        console.error(`Super Admin Auth Error: Token version mismatch for user ${decoded.id}`);
        return res.status(403).json({ error: "Oturumunuz güncel değil. Lütfen tekrar giriş yapın." });
      }
      
      req.user = user;
      next();
    } catch (dbErr) {
      console.error("Super Admin Auth DB Error:", dbErr);
      return res.status(500).json({ error: "Yetki kontrolü sırasında hata oluştu." });
    }
  });
}

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

    // 0. Clinics Tablosu
    await db.query(`
      CREATE TABLE IF NOT EXISTS clinics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const clinicRes = await db.query("SELECT id FROM clinics WHERE id = 1");
    if (clinicRes.rowCount === 0) {
      await db.query(`INSERT INTO clinics (id, name, subdomain) VALUES (1, 'Merkez Klinik', 'merkez')`);
    }

    // Users tablosu kontrolü
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        name VARCHAR(100),
        surname VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        token_version INTEGER DEFAULT 1,
        reset_token VARCHAR(255),
        reset_token_expiry TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(clinic_id, email)
      )
    `);
    
    // Users tablosu için eksik sütunlar (Render/Existing Table fix)
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS surname VARCHAR(100)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id)`);
    
    try {
      await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;`);
      await db.query(`ALTER TABLE users ADD CONSTRAINT users_clinic_email_key UNIQUE(clinic_id, email);`);
    } catch(e){}

    // Diğer tablolar için clinic_id sütunları
    await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id)`);
    await db.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id)`);
    await db.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id)`);
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id)`);

    // Appointments tablosu için eksik sütunlar
    await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id INTEGER`);

    // Site Content - site_title ve site_logo_url
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)`);
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS about_image TEXT`);
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS site_title TEXT`);
    await db.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS site_logo_url TEXT`);
    // Doctors - bio
    await db.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT`);
    // Ensure ID=1 exists in site_content
    const res = await db.query("SELECT id FROM site_content WHERE id = 1 AND clinic_id = 1");
    if (res.rowCount === 0) {
      await db.query("INSERT INTO site_content (id, clinic_id, about_title) VALUES (1, 1, 'Hakkımızda') ON CONFLICT DO NOTHING");
    }

    // --- SÜPER ADMİN TANIMLAMA ---
    // slh.ozgen@gmail.com adresini sistem genelinde Süper Admin yapar.
    await db.query(`
      UPDATE users 
      SET role = 'superadmin' 
      WHERE email = 'slh.ozgen@gmail.com'
    `);
    
    console.log("Veritabanı sütunları doğrulandı ve Süper Admin kontrolü yapıldı.");
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
  console.log("Gelen Dosya Tipi:", file.mimetype, "Uzantı:", path.extname(file.originalname));
  const allowedTypes = /jpeg|jpg|png|webp|gif|avif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype.toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error(`Güvenlik İhlali: Gelen dosya tipi (${file.mimetype}) desteklenmiyor. Sadece .png, .jpg, .jpeg, .webp, .avif yüklenebilir!`));
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
async function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Erişim reddedildi. Lütfen giriş yapın." });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: "Geçersiz veya süresi dolmuş oturum." });
    
    try {
      // Veritabanından kullanıcıyı ve token_version bilgisini kontrol et
      const userResult = await db.query("SELECT id, role, clinic_id, token_version FROM users WHERE id = $1", [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: "Kullanıcı bulunamadı." });
      }

      const user = userResult.rows[0];

      // KRİTİK GÜVENLİK: Kullanıcı bu kliniğe mi ait? (SÜPER ADMİN DEĞİLSE)
      if (user.role !== 'superadmin' && user.clinic_id !== req.clinic_id) {
        return res.status(403).json({ error: "Bu kliniğin admin paneline erişim yetkiniz yok." });
      }

      // Eğer JWT içindeki token_version veritabanındakinden farklıysa (şifre değişmişse) girişi reddet
      if (user.token_version !== decoded.token_version) {
        return res.status(403).json({ error: "Şifreniz değiştirildiği için oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın." });
      }

      if (user.role !== 'admin' && user.role !== 'superadmin') {
        return res.status(403).json({ error: "Bu işlem için admin yetkisi gerekiyor." });
      }
      
      req.user = user;
      next();
    } catch (dbErr) {
      console.error("Middleware DB Hatası:", dbErr);
      return res.status(500).json({ error: "Kimlik doğrulaması sırasında bir hata oluştu." });
    }
  });
}

// JWT User Authentication Middleware (Regular Users)
async function authenticateUser(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Erişim reddedildi. Lütfen giriş yapın." });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: "Geçersiz veya süresi dolmuş oturum." });
    
    try {
      const userResult = await db.query("SELECT id, name, surname, email, phone, role, clinic_id, token_version FROM users WHERE id = $1", [decoded.id]);
      
      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: "Kullanıcı bulunamadı." });
      }

      const user = userResult.rows[0];

      // Kullanıcı bu kliniğe mi ait?
      if (user.clinic_id !== req.clinic_id) {
        return res.status(403).json({ error: "Bu kliniğe erişim yetkiniz yok." });
      }

      if (user.token_version !== decoded.token_version) {
        return res.status(403).json({ error: "Şifreniz değiştirildiği için oturumunuz sonlandırıldı. Lütfen tekrar giriş yapın." });
      }
      
      req.user = user;
      next();
    } catch (dbErr) {
      console.error("Middleware DB Hatası:", dbErr);
      return res.status(500).json({ error: "Kimlik doğrulaması sırasında bir hata oluştu." });
    }
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

// Randevu Al (POST) - Ödeme sonrası gerçek kayıt
app.post("/api/appointments", async (req, res) => {
  const { patientName, patientPhone, patientEmail, service, therapist, selectedDateTime, userId, service_price } = req.body;

  if (!patientName || !patientPhone || !service || !therapist || !selectedDateTime) {
    return res.status(400).json({ error: "Lütfen gerekli tüm alanları doldurun." });
  }

  try {
    const result = await db.query(
      `INSERT INTO appointments (clinic_id, patient_name, patient_phone, patient_email, service_id, doctor_id, appointment_date, user_id, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.clinic_id, patientName, patientPhone, patientEmail, service, therapist, selectedDateTime, userId || null, service_price || null]
    );
    res.json({ message: "Randevunuz başarıyla oluşturuldu.", appointment: result.rows[0] });
  } catch (err) {
    console.error("Randevu oluşturma hatası (DB):", err);
    res.status(500).json({ error: "Randevu oluşturulamadı." });
  }
});

// Takvim İçin Dolu Saatleri Getir (GET - Müşteriler İçin)
app.get("/api/appointments/booked", async (req, res) => {
  try {
    const result = await db.query(`SELECT appointment_date FROM appointments WHERE clinic_id = $1`, [req.clinic_id]);
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
        a.id, a.patient_name, a.patient_phone, a.patient_email, a.appointment_date,
        a.status, a.created_at, a.price,
        s.title as service_name,
        d.full_name as doctor_name
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.clinic_id = $1
      ORDER BY a.appointment_date DESC
    `, [req.clinic_id]);
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
      "UPDATE appointments SET status = $1 WHERE id = $2 AND clinic_id = $3 RETURNING *",
      [status, id, req.clinic_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Randevu bulunamadı veya yetkiniz yok" });
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
    const result = await db.query("DELETE FROM appointments WHERE id = $1 AND clinic_id = $2 RETURNING *", [id, req.clinic_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Randevu bulunamadı veya yetkiniz yok" });
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

// --- SUPER ADMIN API (Klinik ve Admin Yönetimi) ---

// Tüm klinikleri listele
app.get("/api/super-admin/clinics", authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, d.title, d.instagram, d.twitter, d.facebook, d.linkedin
      FROM clinics c
      LEFT JOIN doctors d ON c.id = d.clinic_id
      ORDER BY c.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Klinikler listelenemedi." });
  }
});

// Süper Admin Dashboard İstatistikleri
app.get("/api/super-admin/dashboard-stats", authenticateSuperAdmin, async (req, res) => {
  try {
    // 1. Toplam Klinik Sayısı (Merkez hariç)
    const clinicsCountResult = await db.query("SELECT COUNT(*) FROM clinics WHERE id != 1");
    const totalClinics = parseInt(clinicsCountResult.rows[0].count);

    // 2. Klinik bazlı detaylı istatistikler
    const clinicStatsResult = await db.query(`
      SELECT 
        c.id, 
        c.name, 
        c.subdomain,
        COUNT(a.id) as total_appointments,
        SUM(COALESCE(a.price, 0)) as total_revenue,
        COUNT(DISTINCT a.patient_phone) as total_patients,
        -- Günlük
        SUM(CASE WHEN a.appointment_date >= CURRENT_DATE THEN COALESCE(a.price, 0) ELSE 0 END) as daily_revenue,
        -- Haftalık
        SUM(CASE WHEN a.appointment_date >= date_trunc('week', CURRENT_DATE) THEN COALESCE(a.price, 0) ELSE 0 END) as weekly_revenue,
        -- Aylık
        SUM(CASE WHEN a.appointment_date >= date_trunc('month', CURRENT_DATE) THEN COALESCE(a.price, 0) ELSE 0 END) as monthly_revenue
      FROM clinics c
      LEFT JOIN appointments a ON c.id = a.clinic_id AND a.status != 'İptal Edildi'
      WHERE c.id != 1
      GROUP BY c.id
      ORDER BY total_revenue DESC
    `);

    // 3. Zaman bazlı genel toplamlar (Günlük, Haftalık, Aylık)
    const timeStatsResult = await db.query(`
      SELECT 
        SUM(CASE WHEN appointment_date >= CURRENT_DATE THEN price ELSE 0 END) as daily_revenue,
        COUNT(CASE WHEN appointment_date >= CURRENT_DATE THEN 1 END) as daily_apps,
        SUM(CASE WHEN appointment_date >= date_trunc('week', CURRENT_DATE) THEN price ELSE 0 END) as weekly_revenue,
        COUNT(CASE WHEN appointment_date >= date_trunc('week', CURRENT_DATE) THEN 1 END) as weekly_apps,
        SUM(CASE WHEN appointment_date >= date_trunc('month', CURRENT_DATE) THEN price ELSE 0 END) as monthly_revenue,
        COUNT(CASE WHEN appointment_date >= date_trunc('month', CURRENT_DATE) THEN 1 END) as monthly_apps
      FROM appointments
      WHERE status != 'İptal Edildi'
    `);

    res.json({
      totalClinics,
      clinicStats: clinicStatsResult.rows,
      overallStats: timeStatsResult.rows[0]
    });
  } catch (err) {
    console.error("Super Admin Stats Error:", err);
    res.status(500).json({ error: "İstatistikler alınamadı." });
  }
});

// Belirli bir kliniğin adminlerini listele
app.get("/api/super-admin/clinics/:id/admins", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "SELECT id, name, surname, email, phone FROM users WHERE clinic_id = $1 AND role = 'admin' ORDER BY id DESC",
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Adminler listelenemedi." });
  }
});

// Kliniğe yeni admin ekle
app.post("/api/super-admin/clinics/:id/admins", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, surname, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "İsim, e-posta ve şifre zorunludur." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (clinic_id, name, surname, email, password, phone, role) VALUES ($1, $2, $3, $4, $5, $6, 'admin') RETURNING id, name, email",
      [id, name, surname, email, hashedPassword, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: "Bu e-posta adresi bu klinik için zaten kayıtlı." });
    }
    res.status(500).json({ error: "Admin eklenemedi." });
  }
});

// Admin sil
app.delete("/api/super-admin/admins/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Süper adminin kendisini silmesini engelle (opsiyonel ama güvenli)
    const adminCheck = await db.query("SELECT role FROM users WHERE id = $1", [id]);
    if (adminCheck.rows.length > 0 && adminCheck.rows[0].role === 'superadmin') {
      return res.status(400).json({ error: "Süper admin silinemez." });
    }

    await db.query("DELETE FROM users WHERE id = $1 AND role = 'admin'", [id]);
    res.json({ message: "Admin silindi." });
  } catch (err) {
    res.status(500).json({ error: "Admin silinemedi." });
  }
});

// Yeni Doktor Sitesi (Klinik + Admin + Profil) ekle
app.post("/api/super-admin/clinics", authenticateSuperAdmin, async (req, res) => {
  const { name, subdomain, email, password, title, instagram, twitter, facebook, linkedin } = req.body;
  
  if (!name || !subdomain || !email || !password) {
    return res.status(400).json({ error: "İsim, subdomain, e-posta ve şifre zorunludur." });
  }

  try {
    await db.query("BEGIN"); // İşlemi sağlama alalım

    // 1. Kliniği oluştur
    const clinicResult = await db.query(
      "INSERT INTO clinics (name, subdomain) VALUES ($1, $2) RETURNING id",
      [name, subdomain.toLowerCase().trim()]
    );
    const clinicId = clinicResult.rows[0].id;

    // 2. Doktorun Admin hesabını oluştur
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (clinic_id, name, email, password, role) VALUES ($1, $2, $3, $4, 'admin')",
      [clinicId, name, email, hashedPassword]
    );

    // 3. Doktorun Vitrin Profilini oluştur (Ana sitede görünecek olan)
    await db.query(
      `INSERT INTO doctors (clinic_id, full_name, title, is_active, bio, email, instagram, twitter, facebook, linkedin) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9)`,
      [clinicId, name, title || 'Uzman Terapist', 'Merhaba, yeni web siteme hoş geldiniz!', email, instagram || null, twitter || null, facebook || null, linkedin || null]
    );

    // 4. Site İçeriğini başlat
    await db.query(
      `INSERT INTO site_content (clinic_id, site_title, about_title) VALUES ($1, $2, 'Hakkımda')`,
      [clinicId, name]
    );

    await db.query("COMMIT");
    res.status(201).json({ message: "Doktor sitesi başarıyla oluşturuldu.", clinicId });
  } catch (err) {
    await db.query("ROLLBACK");
    if (err.code === '23505') return res.status(400).json({ error: "Bu subdomain veya e-posta zaten kullanımda." });
    console.error("Unified Creation Error:", err);
    res.status(500).json({ error: "Sistem hatası oluştu." });
  }
});

// Doktor Sitesi (Klinik + Profil) Güncelle
app.put("/api/super-admin/clinics/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, subdomain, title, instagram, twitter, facebook, linkedin } = req.body;

  if (!name || !subdomain) {
    return res.status(400).json({ error: "İsim ve subdomain zorunludur." });
  }

  try {
    await db.query("BEGIN");

    // 1. Kliniği Güncelle
    await db.query(
      "UPDATE clinics SET name = $1, subdomain = $2 WHERE id = $3",
      [name, subdomain.toLowerCase().trim(), id]
    );

    // 2. Doktor Profilini Güncelle
    await db.query(
      `UPDATE doctors SET full_name = $1, title = $2, instagram = $3, twitter = $4, facebook = $5, linkedin = $6 WHERE clinic_id = $7`,
      [name, title || null, instagram || null, twitter || null, facebook || null, linkedin || null, id]
    );

    // 3. Site Content Başlığını Güncelle
    await db.query(
      "UPDATE site_content SET site_title = $1 WHERE clinic_id = $2",
      [name, id]
    );

    await db.query("COMMIT");
    res.json({ message: "Klinik başarıyla güncellendi." });
  } catch (err) {
    await db.query("ROLLBACK");
    if (err.code === '23505') return res.status(400).json({ error: "Bu subdomain zaten kullanımda." });
    console.error("Update Clinic Error:", err);
    res.status(500).json({ error: "Güncelleme sırasında hata oluştu." });
  }
});

// Klinik durumunu değiştir (Aktif/Pasif)
app.patch("/api/super-admin/clinics/:id/status", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    const result = await db.query("UPDATE clinics SET is_active = $1 WHERE id = $2 RETURNING *", [is_active, id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Durum güncellenemedi." });
  }
});

// Klinik Sil (Kritik İşlem)
app.delete("/api/super-admin/clinics/:id", authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  if (id == 1) return res.status(400).json({ error: "Merkez klinik silinemez." });
  
  try {
    // Transaction başlatarak tüm verilerin güvenli silinmesini sağlayalım
    await db.query("BEGIN");

    // Kliniğe bağlı tüm verileri sırayla temizleyelim
    await db.query("DELETE FROM appointments WHERE clinic_id = $1", [id]);
    await db.query("DELETE FROM doctors WHERE clinic_id = $1", [id]);
    await db.query("DELETE FROM services WHERE clinic_id = $1", [id]);
    await db.query("DELETE FROM site_content WHERE clinic_id = $1", [id]);
    await db.query("DELETE FROM users WHERE clinic_id = $1", [id]);
    
    // Son olarak kliniği silelim
    const result = await db.query("DELETE FROM clinics WHERE id = $1 RETURNING *", [id]);
    
    if (result.rowCount === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Klinik bulunamadı." });
    }

    await db.query("COMMIT");
    res.json({ message: "Klinik ve tüm bağlı veriler (randevular, kullanıcılar, içerikler vb.) başarıyla silindi." });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Klinik Silme HATASI - SQL Error Code:", err.code);
    console.error("Klinik Silme HATASI - Message:", err.message);
    console.error("Klinik Silme HATASI - Detail:", err.detail);
    res.status(500).json({ error: "Klinik silinemedi. Detaylı hata için sunucu loglarına bakın." });
  }
});

app.listen(PORT, () => {
  console.log(`Server çalisiyor: http://localhost:${PORT}`);
  initWhatsAppBot();
});

app.get("/api/site-content", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM site_content WHERE clinic_id = $1 LIMIT 1", [req.clinic_id]);

    if (result.rowCount === 0) {
      return res.json({ about_title: "Hakkımızda", about_text: "" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB Site-content Error" });
  }
});

// ==========================================
// USER PROFILE API
// ==========================================

// Get Current User Profile
app.get("/api/user/me", authenticateUser, async (req, res) => {
  res.json(req.user);
});

// Update User Profile
app.put("/api/user/me", authenticateUser, async (req, res) => {
  const { name, surname, phone, email } = req.body;
  
  try {
    // Email uniqueness check if email is being changed
    if (email && email !== req.user.email) {
      const emailCheck = await db.query("SELECT id FROM users WHERE email = $1 AND id != $2", [email, req.user.id]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: "Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor." });
      }
    }

    const result = await db.query(
      `UPDATE users 
       SET name = $1, surname = $2, phone = $3, email = $4 
       WHERE id = $5 RETURNING id, name, surname, email, phone, role`,
      [name || req.user.name, surname || req.user.surname, phone || req.user.phone, email || req.user.email, req.user.id]
    );

    res.json({ message: "Profiliniz başarıyla güncellendi.", user: result.rows[0] });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ error: "Profil güncellenirken bir hata oluştu." });
  }
});

// Delete User Profile
app.delete("/api/user/me", authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const phone = req.user.phone;

    // Sadece hastalar kendi hesabını silebilir, adminleri koruyalım
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      return res.status(403).json({ error: "Yönetici hesapları buradan silinemez." });
    }

    // Geçmiş randevulardaki eşleşmeyi sil (randevular durmalı ama kime ait olduğu kalkmalı)
    await db.query("UPDATE appointments SET user_id = NULL WHERE user_id = $1", [userId]);
    
    // WhatsApp patients kaydını da kaldır ki baştan "Kayıtsız" olarak tanısın
    if (phone) {
        await db.query("DELETE FROM patients WHERE phone = $1", [phone]);
    }

    // Son olarak hesabı (şifre vs.) sil
    await db.query("DELETE FROM users WHERE id = $1", [userId]);

    res.json({ message: "Hesabınız başarıyla silindi ve veritabanından kaldırıldı." });
  } catch (err) {
    console.error("Profile Delete Error:", err);
    res.status(500).json({ error: "Hesap silinirken sunucuda bir hata oluştu." });
  }
});


// Get User Appointments (History)
app.get("/api/user/appointments", authenticateUser, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        a.id, a.patient_name, a.appointment_date, a.status, a.created_at,
        s.title as service_name,
        d.full_name as doctor_name
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN doctors d ON a.doctor_id = d.id
      WHERE a.user_id = $1 AND a.clinic_id = $2
      ORDER BY a.appointment_date DESC
    `, [req.user.id, req.clinic_id]);
    
    res.json(result.rows);
  } catch (err) {
    console.error("User appointments error:", err);
    res.status(500).json({ error: "Randevularınız getirilemedi." });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, surname, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    // Mail var mi (Sadece o klinik için kontrol et)
    const userCheck = await db.query("SELECT * FROM users WHERE email=$1 AND clinic_id=$2", [
      email,
      req.clinic_id
    ]);

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Bu e-posta adresi bu klinik için zaten kayıtlı." });
    }

    // Şifre hash
    const hashed = await bcrypt.hash(password, 10);

    const newUser = await db.query(
      "INSERT INTO users(clinic_id, name, surname, email, password, phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", 
      [req.clinic_id, name, surname || null, email, hashed, phone || null]
    );

    const newUserId = newUser.rows[0].id;

    // Eğer bir randevu ID'si gönderilmişse, onu bu kullanıcıya bağla
    const { appointmentId } = req.body;
    if (appointmentId) {
      // Güvenlik: Sadece email adresi ve kliniği eşleşen randevuyu bağla
      await db.query(
        "UPDATE appointments SET user_id = $1 WHERE id = $2 AND patient_email = $3 AND clinic_id = $4",
        [newUserId, appointmentId, email, req.clinic_id]
      );
    }

    res.json({ success: true, userId: newUserId });
  } catch (err) {
    console.error("Signup Hata:", err);
    res.status(500).json({ error: "Sunucu hatasi" });
  }
});
app.post("/api/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  let query = "SELECT * FROM users WHERE email=$1";
  let params = [email];

  // Eğer bir kliniğin subdomain'indeysek, sadece o kliniğe ait kullanıcıları ara
  if (req.clinic_id) {
    query += " AND clinic_id=$2";
    params.push(req.clinic_id);
  }

  const result = await db.query(query, params);

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "Kullanıcı bulunamadı veya bu klinik için yetkiniz yok." });
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ error: "Şifre hatalı" });
  }

  // Eğer ana domainde giriş yapmaya çalışıyorsa ve bir kliniğe bağlıysa (ve süper admin değilse)
  // onu kendi subdomainine yönlendirecek bilgiyi de gönderelim.
  let redirectUrl = null;
  if (!req.clinic_id && user.role !== 'superadmin' && user.clinic_id) {
    const clinicRes = await db.query("SELECT subdomain FROM clinics WHERE id = $1", [user.clinic_id]);
    if (clinicRes.rowCount > 0) {
      const subdomain = clinicRes.rows[0].subdomain;
      // Host'u dinamik alalım (localhost mu canlı mı?)
      const hostParts = req.get('host').split('.');
      let domain = hostParts.slice(-2).join('.'); // örn: localhost:3000 veya site.com
      if (domain.includes('localhost')) domain = 'localhost:3000';
      redirectUrl = `http://${subdomain}.${domain}/admin.html`;
    }
  }

  // TOKEN içine rol, clinic_id ve token_version koyuyoruz
  const token = jwt.sign(
    {
      id: user.id,
      clinic_id: user.clinic_id,
      role: user.role,
      token_version: user.token_version,
    },
    JWT_SECRET,
    { expiresIn: "1d" },
  );

  res.json({
    token,
    role: user.role,
    name: user.name,
    userId: user.id,
    redirectUrl: redirectUrl // Frontend buraya yönlendirebilir
  });
});

// Şifremi Unuttum - Token Oluştur ve Mail Gönder
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const userResult = await db.query("SELECT * FROM users WHERE email = $1 AND clinic_id = $2", [email, req.clinic_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Bu e-posta adresi ile kayıtlı bir kullanıcı bulunamadı." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 3600000); // 1 saat geçerli

    await db.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE email = $3 AND clinic_id = $4",
      [token, expiry, email, req.clinic_id]
    );

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password.html?token=${token}`;

    if (!process.env.RESEND_API_KEY) {
        console.error("E-POSTA AYARLARI EKSİK! (RESEND_API_KEY yok)");
        return res.status(500).json({ error: "Sunucu e-posta ayarları yapılmamış. Lütfen yönetici ile iletişime geçin." });
    }

    console.log(`E-posta gönderimi başlatıldı (Resend HTTP API via Web): ${email}...`);
    
    // E-posta gönderimi (Resend API)
    const { data, error } = await resend.emails.send({
      from: `Fast Terapi <${process.env.EMAIL_USER || 'onboarding@resend.dev'}>`, // Eğer kendi alan adınız yoksa 'onboarding@resend.dev' kullanmalısınız.
      to: email,
      subject: "Şifre Yenileme Talebi - Fast Terapi",
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
      `
    });

    if (error) {
      console.error("RESEND API HATASI:", error);
      return res.status(500).json({ error: "E-posta gönderilemedi, lütfen tekrar deneyin.", detail: error.message });
    }

    console.log("E-posta başarıyla gönderildi! ✅ ID:", data?.id);
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

    // Şifreyi güncelle ve token_version'ı artır (tüm cihazlardan çıkış yapılması için)
    await db.query(
      "UPDATE users SET password = $1, token_version = token_version + 1, reset_token = NULL, reset_token_expiry = NULL WHERE email = $2",
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

      const result = await db.query(
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
          whatsapp_number=COALESCE($14, whatsapp_number),
          updated_at=NOW()
        WHERE clinic_id=$15
        RETURNING *
      `,
        [
          about_title || '',
          about_text || '',
          feature_title1 || '',
          feature_title2 || '',
          feature_title3 || '',
          feature_desc1 || '',
          feature_desc2 || '',
          feature_desc3 || '',
          feature1 || '',
          feature2 || '',
          feature3 || '',
          feature4 || '',
          imagePath,
          whatsapp_number || null,
          req.clinic_id
        ],
      );

      if (result.rowCount === 0) {
        // Eğer o kliniğin satırı yoksa oluştur
        await db.query(`INSERT INTO site_content (clinic_id, about_title, whatsapp_number) VALUES ($1, $2, $3)`, [req.clinic_id, about_title || 'Hakkımızda', whatsapp_number || null]);
      }

      res.json({ success: true });
    } catch (err) {
      console.error("ABOUT UPDATE ERROR:", {
        message: err.message,
        code: err.code,
        detail: err.detail,
        stack: err.stack
      });

      res.status(500).json({
        error: "Veritabanı Güncelleme Hatası",
        detail: err.message,
        code: err.code
      });
    }
  },
);

// General Settings Update (Title, Logo, WhatsApp)
app.post("/api/site-content/settings", authenticateAdmin, upload.single("logo"), async (req, res) => {
  const { whatsapp_number, site_title } = req.body;
  let logo_url = null;

  if (req.file) {
    logo_url = `/uploads/${req.file.filename}`;
  }

  try {
    // Önce mevcut veriyi kontrol et
    const checkRes = await db.query("SELECT id FROM site_content WHERE clinic_id = $1", [req.clinic_id]);

    if (checkRes.rowCount === 0) {
      await db.query(
        `INSERT INTO site_content (
          clinic_id, whatsapp_number, site_title, site_logo_url, 
          about_title, about_text, about_image,
          feature_title1, feature_title2, feature_title3, 
          feature_desc1, feature_desc2, feature_desc3, 
          feature1, feature2, feature3, feature4
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          req.clinic_id, whatsapp_number || null, site_title || null, logo_url || null, 
          'Hakkımızda', '', '',
          '', '', '', 
          '', '', '', 
          '', '', '', ''
        ]
      );
    } else {
      let query = "UPDATE site_content SET whatsapp_number = $1, site_title = $2";
      let params = [whatsapp_number || null, site_title || null, req.clinic_id];

      if (logo_url) {
        query += ", site_logo_url = $4";
        params.push(logo_url);
      }

      query += " WHERE clinic_id = $3";
      await db.query(query, params);
    }

    res.json({ success: true, logo_url: logo_url });
  } catch (err) {
    console.error("SETTINGS UPDATE ERROR:", err);
    res.status(500).json({ error: "Sunucu hatası", detail: err.message, code: err.code });
  }
});

//Doktorları getir
app.get("/api/doctors", async (req, res) => {
  try {
    let result;
    if (req.clinic_id && req.clinic_id !== 1) {
      // Belirli bir alt domaindeysek sadece o kliniğin doktorlarını getir
      result = await db.query("SELECT * FROM doctors WHERE clinic_id = $1 ORDER BY id DESC", [req.clinic_id]);
    } else {
      // Ana domaindeysek (Merkez) TÜM aktif doktorları ve bağlı oldukları kliniğin subdomain bilgisini getir
      // Doktor fotoğrafı yerine o kliniğin "Hakkımızda" fotoğrafını çekiyoruz (image_path olarak gönderilecek)
      // Doktorun biyografisi yerine o kliniğin "Hakkımızda" yazısını çekiyoruz (about_text olarak)
      result = await db.query(`
        SELECT d.*, c.subdomain, sc.about_image as image_path, sc.about_text
        FROM doctors d
        LEFT JOIN clinics c ON d.clinic_id = c.id
        LEFT JOIN site_content sc ON sc.clinic_id = d.clinic_id
        WHERE d.is_active = true AND d.clinic_id != 1
        ORDER BY d.id DESC
      `);
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json(result.rows);
  } catch (err) {
    console.error("DOCTOR GET ERROR:", err);
    res.status(500).json({ error: "Doktor verileri alınamadı" });
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

    const isActiveBool = is_active === 'true' || is_active === true;

    let imagePath = null;
    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    await db.query(
      `
        INSERT INTO doctors (
          clinic_id,
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
      [
        req.clinic_id,
        full_name,
        title,
        imagePath,
        phone,
        email,
        instagram,
        twitter,
        facebook,
        linkedin,
        isActiveBool,
        bio
      ],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("DOCTOR INSERT ERROR:", err);
    res.status(500).json({ error: "Doktor ekleme hatası", detail: err.message });
  }
});

//Doctor Delete
app.delete("/api/doctors/:id", authenticateAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await db.query(
      "DELETE FROM doctors WHERE id = $1 AND clinic_id = $2 RETURNING id",
      [id, req.clinic_id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Doktor bulunamadı veya yetkiniz yok" });
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
    let result;
    if (req.clinic_id) {
      result = await db.query("SELECT * FROM services WHERE clinic_id = $1 ORDER BY id ASC", [req.clinic_id]);
    } else {
      result = await db.query("SELECT * FROM services ORDER BY id ASC");
    }
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
    const result = await db.query("SELECT * FROM services WHERE id = $1 AND clinic_id = $2", [id, req.clinic_id]);
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
    const { title, dsc, price } = req.body;
    if (!title || !dsc) return res.status(400).json({ error: "Başlık ve açıklama gerekli" });

    let imagePath = null;
    if (req.file) {
      imagePath = "/uploads/" + req.file.filename;
    }

    const result = await db.query(
      `INSERT INTO services (clinic_id, title, dsc, image_path, price) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [req.clinic_id, title, dsc, imagePath, price || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet eklenemedi" });
  }
});

// POST yeni hizmet (Tekrarlanan rota kaldırıldı ve üsttekiyle birleştirildi)

// PUT güncelleme (sadece title, dsc, image_path ve price)
app.put("/api/services/:id", authenticateAdmin, upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { title, dsc, price } = req.body;

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
           price = $4,
           updated_at = NOW()
       WHERE id = $5 AND clinic_id = $6
       RETURNING *`,
      [title, dsc, imagePath, price || null, id, req.clinic_id],
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Hizmet bulunamadı veya yetkiniz yok" });
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
      "DELETE FROM services WHERE id = $1 AND clinic_id = $2 RETURNING *",
      [id, req.clinic_id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Hizmet bulunamadı veya yetkiniz yok" });
    res.json({ message: "Hizmet silindi", service: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Hizmet silinemedi" });
  }
});
