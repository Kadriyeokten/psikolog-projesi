const db = require("./server/db");
db.query("SELECT id, email, role FROM users", (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows);
  process.exit();
});
