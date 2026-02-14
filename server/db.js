const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "psikologdb",   // 👈 BURASI ÇOK ÖNEML
  password: "123456",
  port: 5432,
});

module.exports = pool;

pool.query("SELECT current_database()", (err, res) => {
  if (err) {
    console.error("DB Hatası:", err);
  } else {
    console.log("Bağlı olunan DB:", res.rows[0].current_database);
  }
});
