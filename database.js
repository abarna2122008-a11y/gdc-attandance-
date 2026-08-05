const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./attendance.db", (err) => {
  if (err) {
    console.error("Database error:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER,
      student_name TEXT,
      email TEXT,
      status TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meeting_id) REFERENCES meetings(id)
    )
  `);
});

module.exports = db;