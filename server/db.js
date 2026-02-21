const { Pool } = require("pg");
require("dotenv").config();

// Render'da DATABASE_URL kullanılır, yerelde DB_USER vb.
const isProduction = process.env.NODE_ENV === "production";

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({
  connectionString: connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

module.exports = pool;

pool.query("SELECT current_database()", (err, res) => {
  if (err) {
    console.error("DB Hatası:", err);
  } else if (res.rows.length > 0) {
    console.log("Bağlı olunan DB:", res.rows[0].current_database);
  }
});
