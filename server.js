const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const url = require("url");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const db = require("./database");

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// MIME types for static file serving
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
    console.log('✅ Loaded .env configuration');
  }
}

loadEnv();

const PORT = parseInt(process.env.GDC_SERVER_PORT) || 3000;

// Mail configuration storage - load from .env if available
let mailConfig = {
  host: process.env.GDC_SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.GDC_SMTP_PORT) || 587,
  secure: process.env.GDC_SMTP_SECURE === 'true',
  user: process.env.GDC_SMTP_USER || "",
  pass: process.env.GDC_SMTP_PASS || "",
  fromName: process.env.GDC_MAIL_FROM_NAME || "Game Development Club",
  replyTo: process.env.GDC_MAIL_REPLY_TO || process.env.GDC_SMTP_USER || ""
};

let mailTransporter = null;
let mailServerReady = false;

// Initialize mail transporter if credentials are available
async function initMailTransporter() {
  if (mailConfig.user && mailConfig.pass) {
    try {
      mailTransporter = nodemailer.createTransport({
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        auth: {
          user: mailConfig.user,
          pass: mailConfig.pass
        }
      });
      console.log('⏳ Verifying mail transporter on startup...');
      await mailTransporter.verify();
      mailServerReady = true;
      console.log('✅ Mail transporter verified and ready');
    } catch (error) {
      mailServerReady = false;
      console.warn('⚠️ Mail transporter startup verification notice:', error.message);
    }
  }
}

initMailTransporter();

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        console.error("Malformed JSON in request body:", err.message);
        resolve({ __parseError: true, error: err.message });
      }
    });
  });
}

const BLOCKED_FILES = new Set([
  ".env",
  ".env.example",
  ".gitignore",
  "attendance.db",
  "package.json",
  "package-lock.json",
  "server.js",
  "database.js",
  "start-mail-server.bat",
  "start-mail-server-hidden.vbs"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".woff2", ".woff", ".ttf"
]);

function serveStatic(res, pathname) {
  const rootDir = path.resolve(__dirname);
  const cleanPath = pathname.replace(/^(\.\.[\/\\])+/, '');
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^[\/\\]/, '');
  const filePath = path.resolve(rootDir, relativePath);
  const baseName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // Guard against directory traversal
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  // Guard against access to hidden, private, or server configuration files
  if (baseName.startsWith(".") || BLOCKED_FILES.has(baseName) || !ALLOWED_EXTENSIONS.has(ext)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden: Access to requested resource is restricted");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  // ===== API ROUTES =====

  // 1. BOOTSTRAP / INITIAL STATE
  if (req.method === "GET" && parsedUrl.pathname === "/api/bootstrap") {
    try {
      const teams = await db.allAsync("SELECT * FROM teams ORDER BY name ASC");
      const members = await db.allAsync(`
        SELECT m.id, m.name, m.email, m.team_id as team, m.created_at
        FROM members m
        ORDER BY m.name ASC
      `);

      // Active meeting
      const activeMeetingRow = await db.getAsync("SELECT * FROM meetings WHERE status = 'active' ORDER BY started_at DESC LIMIT 1");
      let activeMeeting = null;
      if (activeMeetingRow) {
        const attendanceRows = await db.allAsync("SELECT member_id, marked_at FROM attendance WHERE meeting_id = ?", [activeMeetingRow.id]);
        const attendanceMap = {};
        attendanceRows.forEach(a => { attendanceMap[a.member_id] = a.marked_at; });

        activeMeeting = {
          id: activeMeetingRow.id,
          title: activeMeetingRow.title,
          date: activeMeetingRow.date,
          startedAt: activeMeetingRow.started_at,
          qrToken: activeMeetingRow.qr_token,
          attendance: attendanceMap
        };
      }

      // History (last 30 closed meetings)
      const closedMeetings = await db.allAsync("SELECT * FROM meetings WHERE status = 'closed' ORDER BY closed_at DESC LIMIT 30");
      const history = [];
      for (const m of closedMeetings) {
        const presentRows = await db.allAsync(`
          SELECT a.member_id as id, a.student_name as name, a.email, a.team_id as team, a.marked_at as markedAt
          FROM attendance a
          WHERE a.meeting_id = ? AND a.status = 'present'
          ORDER BY a.marked_at ASC
        `, [m.id]);

        const absentRows = await db.allAsync(`
          SELECT a.member_id as id, a.student_name as name, a.email, a.team_id as team, a.marked_at as markedAt
          FROM attendance a
          WHERE a.meeting_id = ? AND a.status = 'absent'
        `, [m.id]);

        history.push({
          id: m.id,
          title: m.title,
          date: m.date,
          startedAt: m.started_at,
          closedAt: m.closed_at,
          totalMembers: m.total_members,
          present: presentRows,
          absent: absentRows
        });
      }

      // Gamification
      const gamificationRows = await db.allAsync("SELECT * FROM gamification");
      const gamification = { points: {}, streaks: {}, badges: {}, totalMeetings: history.length };
      gamificationRows.forEach(g => {
        gamification.points[g.member_id] = g.points;
        gamification.streaks[g.member_id] = g.streak;
        try {
          gamification.badges[g.member_id] = JSON.parse(g.badges || "[]");
        } catch (_) {
          gamification.badges[g.member_id] = [];
        }
      });

      return sendJson(res, 200, {
        teams: teams.length ? teams : [{ id: "default", name: "General", color: "#0f8f63" }],
        members,
        activeMeeting,
        history,
        gamification
      });
    } catch (err) {
      console.error("Bootstrap error:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 2. MEMBERS APIS
  if (req.method === "GET" && parsedUrl.pathname === "/api/members") {
    try {
      const rows = await db.allAsync("SELECT id, name, email, team_id as team FROM members ORDER BY name ASC");
      return sendJson(res, 200, rows);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/members") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON" });
    const { id, name, email, team } = body;
    if (!name || !email) return sendJson(res, 400, { error: "Name and email are required" });

    const memberId = id || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const teamId = team || "default";

    try {
      await db.runAsync(`
        INSERT INTO members (id, name, email, team_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name=excluded.name, team_id=excluded.team_id
      `, [memberId, name.trim(), email.trim().toLowerCase(), teamId]);

      // Ensure gamification row exists
      await db.runAsync(`
        INSERT OR IGNORE INTO gamification (member_id, points, streak, badges)
        VALUES (?, 0, 0, '[]')
      `, [memberId]);

      return sendJson(res, 200, { success: true, member: { id: memberId, name, email, team: teamId } });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/members/delete") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON" });
    const { id } = body;
    if (!id) return sendJson(res, 400, { error: "Member ID required" });

    try {
      await db.runAsync("DELETE FROM members WHERE id = ?", [id]);
      await db.runAsync("DELETE FROM gamification WHERE member_id = ?", [id]);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/members/seed") {
    try {
      for (let i = 1; i <= 15; i++) {
        const num = String(i).padStart(2, "0");
        const id = `seed-${num}`;
        const name = `GDC Member ${num}`;
        const email = `member${num}@gdc.local`;
        await db.runAsync(`
          INSERT OR IGNORE INTO members (id, name, email, team_id)
          VALUES (?, ?, ?, 'default')
        `, [id, name, email]);
        await db.runAsync(`
          INSERT OR IGNORE INTO gamification (member_id, points, streak, badges)
          VALUES (?, 0, 0, '[]')
        `, [id]);
      }
      const members = await db.allAsync("SELECT id, name, email, team_id as team FROM members ORDER BY name ASC");
      return sendJson(res, 200, { success: true, members });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/members/clear") {
    try {
      await db.runAsync("DELETE FROM members");
      await db.runAsync("DELETE FROM gamification");
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 3. TEAMS APIS
  if (req.method === "GET" && parsedUrl.pathname === "/api/teams") {
    try {
      const teams = await db.allAsync("SELECT * FROM teams ORDER BY name ASC");
      return sendJson(res, 200, teams);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/teams") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON" });
    const { name, color } = body;
    if (!name || !name.trim()) return sendJson(res, 400, { error: "Team name required" });

    const teamId = body.id || `team-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const teamColor = color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

    try {
      await db.runAsync(`
        INSERT INTO teams (id, name, color)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color
      `, [teamId, name.trim(), teamColor]);
      return sendJson(res, 200, { success: true, team: { id: teamId, name: name.trim(), color: teamColor } });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/teams/delete") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON" });
    const { id } = body;
    if (!id || id === "default") return sendJson(res, 400, { error: "Cannot delete default team" });

    try {
      // Reassign members to default team
      await db.runAsync("UPDATE members SET team_id = 'default' WHERE team_id = ?", [id]);
      await db.runAsync("DELETE FROM teams WHERE id = ?", [id]);
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 4. MEETINGS & ATTENDANCE APIS
  if (req.method === "POST" && parsedUrl.pathname === "/api/meetings/start") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });

    const active = await db.getAsync("SELECT id FROM meetings WHERE status = 'active' LIMIT 1");
    if (active) {
      return sendJson(res, 400, { error: "A meeting is already active. Close it before starting another." });
    }

    const meetingId = body.id || `meeting-${Date.now()}`;
    const title = (body.title || "Weekly Sprint Sync").trim();
    const date = body.date || new Date().toISOString().split("T")[0];
    const startedAt = new Date().toISOString();
    const qrToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    try {
      await db.runAsync(`
        INSERT INTO meetings (id, title, date, started_at, status, qr_token)
        VALUES (?, ?, ?, ?, 'active', ?)
      `, [meetingId, title, date, startedAt, qrToken]);

      return sendJson(res, 200, {
        success: true,
        meeting: { id: meetingId, title, date, startedAt, qrToken, attendance: {} }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/attendance/mark") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });

    const { memberId, name, email } = body;
    const active = await db.getAsync("SELECT id FROM meetings WHERE status = 'active' LIMIT 1");
    if (!active) {
      return sendJson(res, 400, { error: "No active meeting to record attendance." });
    }

    const member = await db.getAsync("SELECT * FROM members WHERE id = ? OR email = ? LIMIT 1", [memberId || "", (email || "").toLowerCase()]);
    if (!member) {
      return sendJson(res, 404, { error: "Member not found." });
    }

    // Check if already marked
    const existing = await db.getAsync("SELECT id FROM attendance WHERE meeting_id = ? AND member_id = ?", [active.id, member.id]);
    if (existing) {
      return sendJson(res, 200, { alreadyMarked: true, member });
    }

    const markedAt = new Date().toISOString();
    try {
      await db.runAsync(`
        INSERT INTO attendance (meeting_id, member_id, student_name, email, team_id, status, marked_at)
        VALUES (?, ?, ?, ?, ?, 'present', ?)
      `, [active.id, member.id, member.name, member.email, member.team_id, markedAt]);

      return sendJson(res, 200, { success: true, member, markedAt });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/attendance/unmark") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });

    const { memberId, email } = body;
    const active = await db.getAsync("SELECT id FROM meetings WHERE status = 'active' LIMIT 1");
    if (!active) {
      return sendJson(res, 400, { error: "No active meeting to update attendance." });
    }

    try {
      await db.runAsync(`
        DELETE FROM attendance 
        WHERE meeting_id = ? AND (member_id = ? OR email = ?)
      `, [active.id, memberId || "", (email || "").toLowerCase()]);

      return sendJson(res, 200, { success: true, unmarked: true, memberId });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/attendance/bulk") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });

    const { action } = body; // "mark_all" or "unmark_all"
    const active = await db.getAsync("SELECT id FROM meetings WHERE status = 'active' LIMIT 1");
    if (!active) {
      return sendJson(res, 400, { error: "No active meeting to update attendance." });
    }

    try {
      if (action === "unmark_all") {
        await db.runAsync("DELETE FROM attendance WHERE meeting_id = ?", [active.id]);
        return sendJson(res, 200, { success: true, action: "unmark_all" });
      }

      if (action === "mark_all") {
        const members = await db.allAsync("SELECT * FROM members");
        const now = new Date().toISOString();
        for (const m of members) {
          await db.runAsync(`
            INSERT OR IGNORE INTO attendance (meeting_id, member_id, student_name, email, team_id, status, marked_at)
            VALUES (?, ?, ?, ?, ?, 'present', ?)
          `, [active.id, m.id, m.name, m.email, m.team_id, now]);
        }
        return sendJson(res, 200, { success: true, action: "mark_all", count: members.length });
      }

      return sendJson(res, 400, { error: "Unknown action." });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/meetings/close") {
    try {
      const active = await db.getAsync("SELECT * FROM meetings WHERE status = 'active' LIMIT 1");
      if (!active) {
        return sendJson(res, 400, { error: "No active meeting to close." });
      }

      const allMembers = await db.allAsync("SELECT * FROM members ORDER BY name ASC");
      const attendanceRows = await db.allAsync(`
        SELECT * FROM attendance
        WHERE meeting_id = ? AND status = 'present'
        ORDER BY marked_at ASC
      `, [active.id]);

      const presentMemberIds = new Set(attendanceRows.map(a => a.member_id));
      const closedAt = new Date().toISOString();

      // Early birds: first 3 checked in by timestamp
      const earlyBirdIds = new Set(attendanceRows.slice(0, 3).map(a => a.member_id));

      // Mark early birds in database
      for (const earlyId of earlyBirdIds) {
        await db.runAsync("UPDATE attendance SET is_early = 1 WHERE meeting_id = ? AND member_id = ?", [active.id, earlyId]);
      }

      // Record absent members
      const absentMembers = [];
      const presentMembers = [];

      for (const m of allMembers) {
        if (presentMemberIds.has(m.id)) {
          const att = attendanceRows.find(a => a.member_id === m.id);
          presentMembers.push({
            id: m.id,
            name: m.name,
            email: m.email,
            team: m.team_id,
            markedAt: att ? att.marked_at : closedAt
          });
        } else {
          absentMembers.push({
            id: m.id,
            name: m.name,
            email: m.email,
            team: m.team_id,
            markedAt: null
          });
          // Insert absent record
          await db.runAsync(`
            INSERT INTO attendance (meeting_id, member_id, student_name, email, team_id, status, marked_at)
            VALUES (?, ?, ?, ?, ?, 'absent', ?)
          `, [active.id, m.id, m.name, m.email, m.team_id, closedAt]);
        }
      }

      // Update meetings record
      await db.runAsync(`
        UPDATE meetings
        SET status = 'closed', closed_at = ?, total_members = ?
        WHERE id = ?
      `, [closedAt, allMembers.length, active.id]);

      // Total closed meetings count
      const meetingCountRow = await db.getAsync("SELECT COUNT(*) as count FROM meetings WHERE status = 'closed'");
      const totalClosedMeetings = meetingCountRow ? meetingCountRow.count : 1;

      // Update Gamification
      for (const m of allMembers) {
        let gam = await db.getAsync("SELECT * FROM gamification WHERE member_id = ?", [m.id]);
        if (!gam) {
          gam = { points: 0, streak: 0, badges: "[]" };
        }
        let points = gam.points || 0;
        let streak = gam.streak || 0;
        let badges = [];
        try { badges = JSON.parse(gam.badges || "[]"); } catch (_) { badges = []; }

        if (presentMemberIds.has(m.id)) {
          points += 10;
          if (earlyBirdIds.has(m.id)) points += 5;
          streak += 1;
        } else {
          streak = 0; // streak resets on absence
        }

        // Badges calculation
        if (streak >= 5 && !badges.includes("perfect_attendance")) badges.push("perfect_attendance");
        if (streak >= 10 && !badges.includes("streak_master")) badges.push("streak_master");
        if (points >= 50 && !badges.includes("team_player")) badges.push("team_player");
        if (points >= 100 && !badges.includes("rising_star")) badges.push("rising_star");
        if (totalClosedMeetings >= 4 && (points / totalClosedMeetings >= 7.5) && !badges.includes("half_century")) {
          badges.push("half_century");
        }

        await db.runAsync(`
          INSERT INTO gamification (member_id, points, streak, badges)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(member_id) DO UPDATE SET points = excluded.points, streak = excluded.streak, badges = excluded.badges
        `, [m.id, points, streak, JSON.stringify(badges)]);
      }

      const meetingRecord = {
        id: active.id,
        title: active.title,
        date: active.date,
        startedAt: active.started_at,
        closedAt,
        totalMembers: allMembers.length,
        present: presentMembers,
        absent: absentMembers
      };

      return sendJson(res, 200, {
        success: true,
        meetingRecord,
        absentees: absentMembers,
        present: presentMembers
      });
    } catch (err) {
      console.error("Close meeting error:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/meetings/clear-history") {
    try {
      await db.runAsync("DELETE FROM meetings WHERE status = 'closed'");
      await db.runAsync("DELETE FROM attendance WHERE meeting_id NOT IN (SELECT id FROM meetings WHERE status = 'active')");
      return sendJson(res, 200, { success: true });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 5. QR CODE & SELF CHECK-IN APIS
  if (req.method === "GET" && parsedUrl.pathname === "/api/meetings/qr") {
    try {
      const active = await db.getAsync("SELECT * FROM meetings WHERE status = 'active' LIMIT 1");
      if (!active) {
        return sendJson(res, 200, { active: false, message: "No active meeting" });
      }

      // Determine best host URL for students on the same network
      const hostHeader = req.headers.host;
      const lanIp = getLocalIpAddress();
      const host = hostHeader && !hostHeader.startsWith("localhost") && !hostHeader.startsWith("127.0.0.1")
        ? hostHeader
        : `${lanIp}:${PORT}`;

      const checkinUrl = `http://${host}/checkin.html?m=${active.id}&t=${active.qr_token}`;
      const qrSvg = await QRCode.toString(checkinUrl, {
        type: "svg",
        margin: 1,
        color: { dark: "#0f0f1a", light: "#ffffff" }
      });

      const countRow = await db.getAsync("SELECT COUNT(*) as count FROM attendance WHERE meeting_id = ? AND status = 'present'", [active.id]);

      return sendJson(res, 200, {
        active: true,
        meeting: {
          id: active.id,
          title: active.title,
          date: active.date,
          startedAt: active.started_at,
          checkedInCount: countRow ? countRow.count : 0
        },
        url: checkinUrl,
        svg: qrSvg,
        token: active.qr_token
      });
    } catch (err) {
      console.error("QR generation error:", err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/meetings/refresh-token") {
    try {
      const active = await db.getAsync("SELECT id FROM meetings WHERE status = 'active' LIMIT 1");
      if (!active) return sendJson(res, 400, { error: "No active meeting" });

      const newToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await db.runAsync("UPDATE meetings SET qr_token = ? WHERE id = ?", [newToken, active.id]);
      return sendJson(res, 200, { success: true, token: newToken });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "GET" && parsedUrl.pathname === "/api/checkin/info") {
    try {
      const meetingId = parsedUrl.searchParams.get("m");
      const token = parsedUrl.searchParams.get("t");

      const active = await db.getAsync("SELECT * FROM meetings WHERE status = 'active' LIMIT 1");
      if (!active || (meetingId && active.id !== meetingId) || (token && active.qr_token !== token)) {
        return sendJson(res, 200, {
          valid: false,
          error: "Meeting check-in is currently inactive or the QR token has expired."
        });
      }

      const members = await db.allAsync(`
        SELECT m.id, m.name, m.email, t.name as team_name, t.color as team_color
        FROM members m
        LEFT JOIN teams t ON m.team_id = t.id
        ORDER BY m.name ASC
      `);

      return sendJson(res, 200, {
        valid: true,
        meeting: {
          id: active.id,
          title: active.title,
          date: active.date,
          startedAt: active.started_at
        },
        members
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/checkin") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON" });

    const { meetingId, token, memberId, email } = body;
    const active = await db.getAsync("SELECT * FROM meetings WHERE status = 'active' LIMIT 1");

    if (!active || active.id !== meetingId || active.qr_token !== token) {
      return sendJson(res, 400, { error: "Check-in expired or invalid. Please scan the current live QR code." });
    }

    const member = await db.getAsync("SELECT * FROM members WHERE id = ? OR email = ? LIMIT 1", [memberId || "", (email || "").toLowerCase()]);
    if (!member) {
      return sendJson(res, 404, { error: "Member profile not found. Please contact a club officer." });
    }

    // Check if already checked in
    const existing = await db.getAsync("SELECT id, marked_at FROM attendance WHERE meeting_id = ? AND member_id = ?", [active.id, member.id]);
    if (existing) {
      return sendJson(res, 200, {
        alreadyMarked: true,
        member: { id: member.id, name: member.name, email: member.email },
        markedAt: existing.marked_at,
        message: "You are already checked in for this meeting!"
      });
    }

    // Count present so far to determine early bird
    const countRow = await db.getAsync("SELECT COUNT(*) as count FROM attendance WHERE meeting_id = ? AND status = 'present'", [active.id]);
    const currentCount = countRow ? countRow.count : 0;
    const isEarly = currentCount < 3;
    const markedAt = new Date().toISOString();

    await db.runAsync(`
      INSERT INTO attendance (meeting_id, member_id, student_name, email, team_id, status, marked_at, is_early)
      VALUES (?, ?, ?, ?, ?, 'present', ?, ?)
    `, [active.id, member.id, member.name, member.email, member.team_id, markedAt, isEarly ? 1 : 0]);

    // Current gamification stats
    const gam = await db.getAsync("SELECT * FROM gamification WHERE member_id = ?", [member.id]);
    const points = (gam?.points || 0) + (isEarly ? 15 : 10);
    const streak = (gam?.streak || 0) + 1;

    return sendJson(res, 200, {
      success: true,
      member: { id: member.id, name: member.name, email: member.email },
      isEarly,
      pointsEarned: isEarly ? 15 : 10,
      totalPoints: points,
      currentStreak: streak,
      markedAt,
      message: isEarly ? "Awesome! You arrived early (+5 bonus points awarded)!" : "Check-in successful! +10 points awarded."
    });
  }


  // Get Mail Server Status
  if (req.method === "GET" && parsedUrl.pathname === "/api/mail/status") {
    sendJson(res, 200, {
      ready: mailServerReady,
      host: mailConfig.host,
      mode: "SMTP",
      sender: mailConfig.user || "Not connected"
    });
    return;
  }

  // Get Mail Configuration
  if (req.method === "GET" && parsedUrl.pathname === "/api/mail/config") {
    sendJson(res, 200, {
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      user: mailConfig.user,
      fromName: mailConfig.fromName,
      replyTo: mailConfig.replyTo,
      hasPassword: Boolean(mailConfig.pass)
    });
    return;
  }

  // Save Mail Configuration
  if (req.method === "POST" && parsedUrl.pathname === "/api/mail/config") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });
    
    // Preserve existing password if not provided in payload
    const password = body.pass || body.password || mailConfig.pass || "";

    mailConfig = {
      host: body.host || "smtp.gmail.com",
      port: parseInt(body.port) || 587,
      secure: Boolean(body.secure),
      user: body.user || "",
      pass: password,
      fromName: body.fromName || body.from || "Game Development Club",
      replyTo: body.replyTo || body.user || ""
    };

    // Create transporter with new config
    try {
      mailTransporter = nodemailer.createTransport({
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        auth: {
          user: mailConfig.user,
          pass: mailConfig.pass
        }
      });

      // Verify connection
      await mailTransporter.verify();
      mailServerReady = true;
      
      sendJson(res, 200, { message: "Mail configuration saved and verified" });
    } catch (error) {
      mailServerReady = false;
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  // Test Mail Server
  if (req.method === "POST" && parsedUrl.pathname === "/api/mail/test") {
    if (!mailTransporter) {
      sendJson(res, 400, { error: "Mail server not configured" });
      return;
    }

    try {
      await mailTransporter.verify();
      mailServerReady = true;
      sendJson(res, 200, { message: "Sender login confirmed" });
    } catch (error) {
      mailServerReady = false;
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  // Send Emails (updated to use saved mail config)
  if (req.method === "POST" && parsedUrl.pathname === "/api/send-warnings") {
    const body = await readBody(req);
    if (body.__parseError) return sendJson(res, 400, { error: "Invalid JSON body" });
    
    // Use saved mail config or fallback to provided credentials
    let transporter;
    if (mailTransporter && mailServerReady) {
      transporter = mailTransporter;
    } else if (body.email && body.password) {
      // Fallback: create temporary transporter from request body
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: body.email,
          pass: body.password
        }
      });
    } else {
      sendJson(res, 400, { error: "No mail configuration available or sender not verified" });
      return;
    }

    const results = [];
    const warnings = body.warnings || body.students || [];
    
    for (let warning of warnings) {
      try {
        await transporter.sendMail({
          from: `"${mailConfig.fromName}" <${mailConfig.user}>`,
          to: warning.to || warning.email,
          subject: warning.subject || "Attendance Warning",
          text: warning.body || `Hi ${warning.name || warning.to}, your attendance is low.`
        });
        results.push({ to: warning.to || warning.email, status: "sent", message: "Sent successfully" });
      } catch (error) {
        results.push({ to: warning.to || warning.email, status: "failed", message: error.message });
      }
    }

    sendJson(res, 200, { message: "Emails processed", results });
    return;
  }

  // ===== STATIC FILES =====
  serveStatic(res, parsedUrl.pathname);
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});