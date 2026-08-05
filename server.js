const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const nodemailer = require("nodemailer");
const db = require("./database");

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
function initMailTransporter() {
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
      console.log('✅ Mail transporter initialized');
    } catch (error) {
      console.error('❌ Failed to initialize mail transporter:', error.message);
    }
  }
}

initMailTransporter();

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => resolve(JSON.parse(body || "{}")));
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // ===== API ROUTES =====

  // Create Meeting
  if (req.method === "POST" && parsedUrl.pathname === "/api/meeting/start") {
    const body = await readBody(req);
    const { title } = body;
    const date = new Date().toISOString().split("T")[0];

    db.run(
      "INSERT INTO meetings (title, date) VALUES (?, ?)",
      [title, date],
      function (err) {
        if (err) return sendJson(res, 500, { error: err.message });
        sendJson(res, 200, { meetingId: this.lastID });
      }
    );
    return;
  }

  // Save Attendance
  if (req.method === "POST" && parsedUrl.pathname === "/api/attendance") {
    const body = await readBody(req);
    const { meeting_id, name, email, status } = body;

    db.run(
      `INSERT INTO attendance (meeting_id, student_name, email, status)
       VALUES (?, ?, ?, ?)`,
      [meeting_id, name, email, status],
      function (err) {
        if (err) return sendJson(res, 500, { error: err.message });
        sendJson(res, 200, { success: true });
      }
    );
    return;
  }

  // Get All Attendance
  if (req.method === "GET" && parsedUrl.pathname === "/api/attendance") {
    db.all(`
      SELECT a.*, m.title, m.date
      FROM attendance a
      JOIN meetings m ON a.meeting_id = m.id
      ORDER BY a.timestamp DESC
    `, [], (err, rows) => {
      if (err) return sendJson(res, 500, { error: err.message });
      sendJson(res, 200, rows);
    });
    return;
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
    
    mailConfig = {
      host: body.host || "smtp.gmail.com",
      port: body.port || 587,
      secure: body.secure || false,
      user: body.user || "",
      pass: body.pass || body.password || "",
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
      sendJson(res, 200, { message: "Sender login confirmed" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  // Send Emails (updated to use saved mail config)
  if (req.method === "POST" && parsedUrl.pathname === "/api/send-warnings") {
    const body = await readBody(req);
    
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
      sendJson(res, 400, { error: "No mail configuration available" });
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
  let filePath = path.join(__dirname, parsedUrl.pathname === "/" ? "index.html" : parsedUrl.pathname);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      res.writeHead(200);
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});