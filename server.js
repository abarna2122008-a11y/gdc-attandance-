const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const tls = require("tls");

const ROOT = __dirname;
loadEnvFile();

const SERVER_PORT = Number(process.env.GDC_SERVER_PORT || process.env.PORT || 3000);
let SMTP = readSmtpConfig();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  serveStatic(url.pathname, res);
});

server.listen(SERVER_PORT, () => {
  console.log(`GDC attendance server: http://localhost:${SERVER_PORT}`);
  if (isSmtpReady()) {
    console.log(`SMTP ready: ${SMTP.from} through ${SMTP.host}:${SMTP.port}`);
  } else {
    console.log("SMTP not configured yet. The app will keep warning drafts as backup.");
  }
});

async function handleApi(req, res, url) {
  if (!isAllowedApiOrigin(req)) {
    sendJson(req, res, 403, { error: "Origin is not allowed for this local API." });
    return;
  }

  if (req.method === "OPTIONS") {
    setApiHeaders(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mail/status") {
    sendJson(req, res, 200, publicMailStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mail/config") {
    sendJson(req, res, 200, publicMailConfig());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mail/config") {
    await handleSaveMailConfig(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mail/test") {
    await handleTestMail(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/send-warnings") {
    await handleSendWarnings(req, res);
    return;
  }

  sendJson(req, res, 404, { error: "Unknown API route." });
}

async function handleSendWarnings(req, res) {
  if (!isSmtpReady()) {
    sendJson(req, res, 503, {
      error: "SMTP is not configured. Save sender setup and try again.",
      results: [],
    });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(req, res, 400, { error: error.message });
    return;
  }

  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  if (!warnings.length) {
    sendJson(req, res, 200, { ok: true, results: [] });
    return;
  }

  if (warnings.length > 30) {
    sendJson(req, res, 400, { error: "Too many warnings in one request." });
    return;
  }

  const cleanWarnings = warnings.map(cleanWarning).filter(Boolean);
  if (cleanWarnings.length !== warnings.length) {
    sendJson(req, res, 400, { error: "Each warning needs a valid to, subject, and body." });
    return;
  }

  try {
    const results = await sendMailBatch(cleanWarnings);
    sendJson(req, res, 200, {
      ok: results.every((item) => item.status === "sent"),
      results,
    });
  } catch (error) {
    sendJson(req, res, 500, {
      error: error.message,
      results: cleanWarnings.map((warning) => ({
        id: warning.id,
        to: warning.to,
        status: "failed",
        message: error.message,
      })),
    });
  }
}

async function handleSaveMailConfig(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(req, res, 400, { error: error.message });
    return;
  }

  let next = {
    host: cleanHost(payload.host),
    port: Number(payload.port || 587),
    secure: Boolean(payload.secure),
    user: cleanEmail(payload.user),
    pass: String(payload.pass || "").trim() || SMTP.pass,
    from: cleanEmail(payload.from || payload.user),
    fromName: cleanHeader(payload.fromName || "Game Development Club"),
    replyTo: cleanEmail(payload.replyTo || payload.user),
  };
  next = normalizeSmtpConfig(next);

  if (!next.host) {
    sendJson(req, res, 400, { error: "SMTP host is required." });
    return;
  }

  if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) {
    sendJson(req, res, 400, { error: "SMTP port must be between 1 and 65535." });
    return;
  }

  if (!isValidEmail(next.user) || !isValidEmail(next.from)) {
    sendJson(req, res, 400, { error: "Sender email is not valid." });
    return;
  }

  if (next.replyTo && !isValidEmail(next.replyTo)) {
    sendJson(req, res, 400, { error: "Reply-to email is not valid." });
    return;
  }

  if (!next.pass) {
    sendJson(req, res, 400, { error: "App password is required the first time." });
    return;
  }

  SMTP = next;
  saveEnvFile(next);
  sendJson(req, res, 200, {
    ok: true,
    config: publicMailConfig(),
    status: publicMailStatus(),
  });
}

async function handleTestMail(req, res) {
  if (!isSmtpReady()) {
    sendJson(req, res, 503, { error: "SMTP is not configured. Save sender setup first." });
    return;
  }

  let connection;
  try {
    connection = await openAuthenticatedSmtp();
    await connection.session.command("QUIT", [221]).catch(() => {});
    connection.socket.end();
    sendJson(req, res, 200, {
      ok: true,
      message: `Sender login confirmed for ${SMTP.from}.`,
      status: publicMailStatus(),
    });
  } catch (error) {
    if (connection?.socket) {
      connection.socket.destroy();
    }
    sendJson(req, res, 500, {
      ok: false,
      error: friendlySmtpError(error.message),
      status: publicMailStatus(),
    });
  }
}

function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^[/\\]+/, "");
  const filePath = path.join(ROOT, requested);
  const relative = path.relative(ROOT, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function publicMailStatus() {
  if (!isSmtpReady()) {
    return {
      ready: false,
      host: SMTP.host || "Not configured",
      sender: SMTP.from || "Not connected",
      mode: mailModeLabel(),
      message: "SMTP settings are missing. Warning drafts will remain available.",
    };
  }

  return {
    ready: true,
    host: `${SMTP.host}:${SMTP.port}`,
    sender: SMTP.from,
    mode: mailModeLabel(),
    message: `SMTP is configured for ${mailModeLabel()}.`,
  };
}

function publicMailConfig() {
  return {
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.secure,
    user: SMTP.user,
    from: SMTP.from,
    fromName: SMTP.fromName,
    replyTo: SMTP.replyTo,
    hasPassword: Boolean(SMTP.pass),
  };
}

function isSmtpReady() {
  return Boolean(SMTP.host && SMTP.port && SMTP.user && SMTP.pass && SMTP.from);
}

function cleanWarning(warning) {
  const to = cleanEmail(warning.to);
  const subject = cleanHeader(warning.subject || "");
  const body = String(warning.body || "").trim();

  if (!isValidEmail(to) || !subject || !body || body.length > 12000) {
    return null;
  }

  return {
    id: cleanHeader(warning.id || ""),
    to,
    name: cleanHeader(warning.name || ""),
    subject,
    body,
  };
}

async function sendMailBatch(warnings) {
  const connection = await openAuthenticatedSmtp();
  const { socket, session } = connection;

  try {
    const results = [];
    for (const warning of warnings) {
      try {
        await sendOneMail(session, warning);
        results.push({
          id: warning.id,
          to: warning.to,
          status: "sent",
          message: "Sent automatically",
        });
      } catch (error) {
        results.push({
          id: warning.id,
          to: warning.to,
          status: "failed",
          message: error.message,
        });
        await session.command("RSET", [250]).catch(() => {});
      }
    }

    await session.command("QUIT", [221]).catch(() => {});
    socket.end();
    return results;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function openAuthenticatedSmtp() {
  let socket = await connectSmtpSocket();
  let session = createSmtpSession(socket);

  try {
    await expectResponse(await session.readResponse(), [220]);
    await session.command(`EHLO ${smtpDomain()}`, [250]);

    if (!SMTP.secure) {
      await session.command("STARTTLS", [220]);
      session.detach();
      socket = await upgradeToTls(socket);
      session = createSmtpSession(socket);
      await session.command(`EHLO ${smtpDomain()}`, [250]);
    }

    await session.command("AUTH LOGIN", [334]);
    await session.command(Buffer.from(SMTP.user).toString("base64"), [334]);
    await session.command(Buffer.from(SMTP.pass).toString("base64"), [235]);
    return { socket, session };
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function sendOneMail(session, warning) {
  await session.command(`MAIL FROM:<${cleanEmail(SMTP.from)}>`, [250]);
  await session.command(`RCPT TO:<${warning.to}>`, [250, 251]);
  await session.command("DATA", [354]);
  session.raw(`${buildRawMessage(warning)}\r\n.\r\n`);
  await expectResponse(await session.readResponse(), [250]);
}

function buildRawMessage(warning) {
  const replyTo = cleanEmail(SMTP.replyTo);
  const headers = [
    `From: ${formatMailbox(SMTP.fromName, SMTP.from)}`,
    `To: ${formatMailbox(warning.name, warning.to)}`,
    `Subject: ${encodeHeader(warning.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@gdc.local>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];

  if (replyTo) {
    headers.push(`Reply-To: ${formatMailbox("", replyTo)}`);
  }

  const message = `${headers.join("\r\n")}\r\n\r\n${warning.body.replace(/\r?\n/g, "\r\n")}`;
  return message
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function connectSmtpSocket() {
  return new Promise((resolve, reject) => {
    const socket = SMTP.secure
      ? tls.connect({
          host: SMTP.host,
          port: SMTP.port,
          servername: SMTP.host,
        })
      : net.connect({
          host: SMTP.host,
          port: SMTP.port,
        });

    const readyEvent = SMTP.secure ? "secureConnect" : "connect";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    }, 30000);

    socket.once(readyEvent, () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function upgradeToTls(socket) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: SMTP.host,
    });

    const timer = setTimeout(() => {
      secureSocket.destroy();
      reject(new Error("SMTP STARTTLS upgrade timed out."));
    }, 30000);

    secureSocket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(secureSocket);
    });

    secureSocket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function createSmtpSession(socket) {
  const pendingLines = [];
  const waiters = [];
  let buffer = "";

  function onData(chunk) {
    buffer += String(chunk);
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      pendingLines.push(line);
      index = buffer.indexOf("\n");
    }
    pump();
  }

  function onError(error) {
    fail(error);
  }

  function onClose() {
    fail(new Error("SMTP connection closed."));
  }

  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  function fail(error) {
    while (waiters.length) {
      waiters.shift().reject(error);
    }
  }

  function pump() {
    const waiter = waiters[0];
    if (!waiter) return;

    while (pendingLines.length) {
      const line = pendingLines.shift();
      waiter.lines.push(line);
      if (/^\d{3} /.test(line)) {
        waiters.shift();
        const code = Number(line.slice(0, 3));
        waiter.resolve({
          code,
          lines: waiter.lines,
          text: waiter.lines.join("\n"),
        });
        pump();
        return;
      }
    }
  }

  function readResponse() {
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject, lines: [] });
      pump();
    });
  }

  async function command(line, expectedCodes) {
    socket.write(`${line}\r\n`);
    return expectResponse(await readResponse(), expectedCodes);
  }

  return {
    readResponse,
    command,
    raw(data) {
      socket.write(data);
    },
    detach() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    },
  };
}

function expectResponse(response, expectedCodes) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP ${response.code}: ${response.text}`);
  }
  return response;
}

function friendlySmtpError(message) {
  const text = String(message || "Unknown SMTP error");
  if (/ETIMEDOUT|timed out/i.test(text)) {
    return "SMTP connection timed out. Use smtp.gmail.com, port 587, and leave SSL 465 unchecked. If it still times out, your network may be blocking SMTP.";
  }
  if (/wrong version number|tls_validate_record_header/i.test(text)) {
    return "SMTP security mode was mismatched. Use port 587 with STARTTLS, or port 465 with SSL/TLS.";
  }
  if (/535|534|Invalid login|Username and Password|Authentication|AUTH/i.test(text)) {
    return "SMTP login failed. Use a Gmail App Password, not your normal password, and make sure the sender email is correct.";
  }
  if (/STARTTLS/i.test(text)) {
    return "STARTTLS failed. Use port 587 with SSL 465 unchecked, or port 465 with SSL 465 checked.";
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) {
    return "SMTP host could not be reached. Check the SMTP host name and internet connection.";
  }
  return text;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(req, res, statusCode, payload) {
  setApiHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function setApiHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function isAllowedApiOrigin(req) {
  const origin = req.headers.origin;
  return !origin || isAllowedOrigin(origin);
}

function isAllowedOrigin(origin) {
  return (
    origin === "null" ||
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
  );
}

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readSmtpConfig() {
  return normalizeSmtpConfig({
    host: process.env.GDC_SMTP_HOST || "",
    port: Number(process.env.GDC_SMTP_PORT || 587),
    secure: parseBool(process.env.GDC_SMTP_SECURE, false),
    user: process.env.GDC_SMTP_USER || "",
    pass: process.env.GDC_SMTP_PASS || "",
    from: process.env.GDC_MAIL_FROM || process.env.GDC_SMTP_USER || "",
    fromName: process.env.GDC_MAIL_FROM_NAME || "Game Development Club",
    replyTo: process.env.GDC_MAIL_REPLY_TO || "",
  });
}

function normalizeSmtpConfig(config) {
  const port = Number(config.port || 587);
  let secure = Boolean(config.secure);

  if (port === 465) {
    secure = true;
  } else if (port === 587 || port === 25 || port === 2525) {
    secure = false;
  }

  return {
    ...config,
    port,
    secure,
  };
}

function mailModeLabel() {
  if (!SMTP.host) return "Not configured";
  return SMTP.secure ? "SSL/TLS" : "STARTTLS";
}

function saveEnvFile(config) {
  const values = {
    GDC_SERVER_PORT: String(SERVER_PORT),
    GDC_SMTP_HOST: config.host,
    GDC_SMTP_PORT: String(config.port),
    GDC_SMTP_SECURE: String(config.secure),
    GDC_SMTP_USER: config.user,
    GDC_SMTP_PASS: config.pass,
    GDC_MAIL_FROM: config.from,
    GDC_MAIL_FROM_NAME: config.fromName,
    GDC_MAIL_REPLY_TO: config.replyTo,
  };

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }

  const content = [
    "# Local sender setup for the Game Development Club attendance app.",
    "# Keep this file private because it stores the sender app password.",
    "",
    ...Object.entries(values).map(([key, value]) => `${key}=${formatEnvValue(value)}`),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(ROOT, ".env"), content, "utf8");
}

function formatEnvValue(value) {
  const text = String(value || "");
  if (/^[A-Za-z0-9_@.:-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function parseBool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function smtpDomain() {
  const hostname = os.hostname().replace(/[^\w.-]/g, "");
  return hostname || "localhost";
}

function cleanHeader(value) {
  return String(value).replace(/[\r\n]/g, " ").trim().slice(0, 240);
}

function cleanHost(value) {
  return String(value || "").replace(/[^A-Za-z0-9.-]/g, "").trim().slice(0, 180);
}

function cleanEmail(value) {
  return String(value || "").replace(/[<>\r\n]/g, "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function encodeHeader(value) {
  const clean = cleanHeader(value);
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function formatMailbox(name, email) {
  const cleanName = cleanHeader(name);
  const cleanAddress = cleanEmail(email);
  return cleanName ? `${JSON.stringify(cleanName)} <${cleanAddress}>` : `<${cleanAddress}>`;
}
