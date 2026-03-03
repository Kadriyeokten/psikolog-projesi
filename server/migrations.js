const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  try {
    console.log("Migrationlar başlatılıyor...");

    // 1. appointments tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        patient_name VARCHAR(100) NOT NULL,
        patient_phone VARCHAR(20) NOT NULL,
        patient_email VARCHAR(100),
        service_id INTEGER,
        doctor_id INTEGER,
        appointment_date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'Bekliyor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Appointments tablosu hazır.");

    // 2. services tablosu ve dsc sütunu
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        dsc TEXT,
        image_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // dsc sütununu TEXT'e dönüştür (eğer daha önce VARCHAR olarak oluşturulduysa)
    await pool.query(`ALTER TABLE services ALTER COLUMN dsc TYPE TEXT;`);
    console.log("Services tablosu hazır.");

    // 3. doctors tablosuna bio sütunu ekle
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
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
    await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT;`);
    console.log("Doctors tablosu hazır.");

    // 4. site_content tablosu ve whatsapp_number
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_content (
        id SERIAL PRIMARY KEY,
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
    await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);`);
    
    // id=1 olan satırın varlığından emin ol (Varsayılan içerik)
    const res = await pool.query("SELECT id FROM site_content WHERE id = 1");
    if (res.rowCount === 0) {
      await pool.query(`
        INSERT INTO site_content (id, about_title, whatsapp_number) 
        VALUES (1, 'Hakkımızda', '905000000000')
      `);
      console.log("Site içeriği için varsayılan satır (id=1) oluşturuldu.");
    }
    
    console.log("Site Content tablosu hazır.");

    console.log("Tüm veritabanı migration işlemleri başarıyla tamamlandı.");
  } catch (err) {
    console.error("Veritabanı migration hatası:", err);
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
