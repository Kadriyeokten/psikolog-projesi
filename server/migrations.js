const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

// db.js ile aynı bağlantı mantığı
const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  try {
    console.log("Migrationlar başlatılıyor (Render/Local)...");

    // 0. clinics (SaaS - Çoklu Müşteri Tablosu)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clinics (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Varsayılan Klinik (Mevcut veriler bozulmasın diye id=1 olarak atanacak)
    const clinicRes = await pool.query("SELECT id FROM clinics WHERE id = 1");
    if (clinicRes.rowCount === 0) {
      await pool.query(`INSERT INTO clinics (id, name, subdomain) VALUES (1, 'Merkez Klinik', 'merkez')`);
    }

    // 1. appointments
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        patient_name VARCHAR(255),
        patient_phone VARCHAR(50),
        patient_email VARCHAR(255),
        service_id INTEGER,
        doctor_id INTEGER,
        appointment_date TIMESTAMP,
        price DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'Bekliyor',
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);`); } catch(e){}
    try { await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id INTEGER;`); } catch(e){}
    try { await pool.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id);`); } catch(e){}

    // 2. services
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        title VARCHAR(255),
        dsc TEXT,
        image_path TEXT,
        price DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);`); } catch(e){}
    try { await pool.query(`ALTER TABLE services ALTER COLUMN dsc TYPE TEXT;`); } catch(e){}
    try { await pool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id);`); } catch(e){}

    // 3. doctors
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        full_name VARCHAR(255),
        title VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        instagram VARCHAR(255),
        twitter VARCHAR(255),
        facebook VARCHAR(255),
        linkedin VARCHAR(255),
        image_path TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT;`); } catch(e){}
    try { await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id);`); } catch(e){}

    // 4. site_content
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_content (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        site_title TEXT,
        site_logo_url TEXT,
        about_title TEXT,
        about_text TEXT,
        feature_title1 TEXT,
        feature_title2 TEXT,
        feature_title3 TEXT,
        feature_desc1 TEXT,
        feature_desc2 TEXT,
        feature_desc3 TEXT,
        feature1 TEXT,
        feature2 TEXT,
        feature3 TEXT,
        feature4 TEXT,
        about_image TEXT,
        whatsapp_number VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try { await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS site_title TEXT;`); } catch(e){}
    try { await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS site_logo_url TEXT;`); } catch(e){}
    try { await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);`); } catch(e){}
    try { await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id);`); } catch(e){}
    
    // Varsayılan id=1 satırı (Merkez Klinik İçin)
    const res = await pool.query("SELECT id FROM site_content WHERE id = 1 AND clinic_id = 1");
    if (res.rowCount === 0) {
      await pool.query(`INSERT INTO site_content (id, clinic_id, about_title, whatsapp_number) VALUES (1, 1, 'Hakkımızda', '905000000000') ON CONFLICT DO NOTHING`);
    }
    
    // 5. users
    await pool.query(`
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
      );
    `);
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS surname VARCHAR(100);`); } catch(e){}
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);`); } catch(e){}
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);`); } catch(e){}
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;`); } catch(e){}
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1;`); } catch(e){}
    try { await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id);`); } catch(e){}
    // Not: Mevcut bir UNIQUE(email) kısıtlaması olabilir, onu silip UNIQUE(clinic_id, email) eklemek daha doğru olur (SaaS için).
    try {
      await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;`);
      await pool.query(`ALTER TABLE users ADD CONSTRAINT users_clinic_email_key UNIQUE(clinic_id, email);`);
    } catch(e){}

    // 6. patients (WhatsApp Hastaları)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        clinic_id INTEGER DEFAULT 1 REFERENCES clinics(id),
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Tüm migrationlar başarıyla tamamlandı.");
  } catch (err) {
    console.error("Migration HATASI:", err);
  } finally {
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
