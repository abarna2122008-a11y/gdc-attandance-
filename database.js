const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "attendance.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database error:", err.message);
  } else {
    console.log("✅ Connected to SQLite database:", dbPath);
  }
});

function initSchema() {
  db.serialize(() => {
    // Teams table
    db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL
      )
    `);

    // Insert default team if not exists
    db.run(`
      INSERT OR IGNORE INTO teams (id, name, color)
      VALUES ('default', 'General', '#0f8f63')
    `);

    // Members table
    db.run(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        team_id TEXT DEFAULT 'default',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id)
      )
    `);

    // Meetings table
    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        started_at DATETIME,
        closed_at DATETIME,
        status TEXT DEFAULT 'active',
        qr_token TEXT,
        total_members INTEGER DEFAULT 0
      )
    `);

    // Attendance records table
    db.run(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT,
        member_id TEXT,
        student_name TEXT,
        email TEXT,
        team_id TEXT,
        status TEXT DEFAULT 'present',
        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_early INTEGER DEFAULT 0,
        FOREIGN KEY (meeting_id) REFERENCES meetings(id),
        FOREIGN KEY (member_id) REFERENCES members(id)
      )
    `);

    // Gamification table
    db.run(`
      CREATE TABLE IF NOT EXISTS gamification (
        member_id TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        badges TEXT DEFAULT '[]',
        FOREIGN KEY (member_id) REFERENCES members(id)
      )
    `);

    // Indexes for performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_meeting ON attendance(meeting_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(member_id)`);
  });
}

// Check for legacy schema migration
db.all("PRAGMA table_info(attendance)", (err, columns) => {
  if (!err && columns && columns.length > 0) {
    const colNames = new Set(columns.map(c => c.name));
    if (!colNames.has("member_id")) {
      console.log("🔄 Migrating legacy database schema...");
      db.serialize(() => {
        db.run("DROP TABLE attendance");
        db.run("DROP TABLE IF EXISTS meetings");
        initSchema();
      });
      return;
    }
  }
  initSchema();
});

// Helper for promise-based queries
db.runAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

db.allAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

db.getAsync = function (sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = db;