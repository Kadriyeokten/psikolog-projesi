const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL; // Canlıda DATABASE_URL kullanılsın

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function runMigrations() {
  try {
    // 1. appointments tablosunu oluştur
    const createAppointmentsTableQuery = `
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
    `;
    await pool.query(createAppointmentsTableQuery);
    console.log("Appointments tablosu başarıyla oluşturuldu veya zaten mevcut.");

    // 2. services tablosundaki dsc sütununu TEXT tipine dönüştür
    const alterServicesTableQuery = `
      ALTER TABLE services ALTER COLUMN dsc TYPE TEXT;
    `;
    await pool.query(alterServicesTableQuery);
    console.log("Services tablosundaki dsc sütunu TEXT tipine dönüştürüldü.");

    console.log("Veritabanı migration işlemleri tamamlandı.");
  } catch (err) {
    console.error("Veritabanı migration hatası:", err);
  } finally {
    await pool.end();
  }
}

runMigrations();