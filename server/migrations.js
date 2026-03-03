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

    // 1. appointments
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

    // 2. services
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
    try { await pool.query(`ALTER TABLE services ALTER COLUMN dsc TYPE TEXT;`); } catch(e){}

    // 3. doctors
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
    try { await pool.query(`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT;`); } catch(e){}

    // 4. site_content
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
    try { await pool.query(`ALTER TABLE site_content ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);`); } catch(e){}
    
    // Varsayılan id=1 satırı
    const res = await pool.query("SELECT id FROM site_content WHERE id = 1");
    if (res.rowCount === 0) {
      await pool.query(`INSERT INTO site_content (id, about_title, whatsapp_number) VALUES (1, 'Hakkımızda', '905000000000')`);
    }
    
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
