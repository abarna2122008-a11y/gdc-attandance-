const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "gdc-attendance.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    closed_at TEXT,
    total_members INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS attendance (
    meeting_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    marked_at TEXT NOT NULL,
    PRIMARY KEY (meeting_id, member_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meeting_members (
    meeting_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    marked_at TEXT,
    PRIMARY KEY (meeting_id, member_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS warning_delivery (
    meeting_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'draft')),
    message TEXT NOT NULL,
    detail TEXT,
    sent_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (meeting_id, member_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );
`);

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return randomUUID();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getMembers() {
  return db
    .prepare("SELECT id, name, email FROM members ORDER BY name COLLATE NOCASE")
    .all();
}

function getActiveMeeting() {
  const meeting = db
    .prepare("SELECT * FROM meetings WHERE closed_at IS NULL ORDER BY started_at DESC LIMIT 1")
    .get();

  if (!meeting) return null;
  return buildActiveMeeting(meeting);
}

function getHistory(limit = 30) {
  const meetings = db
    .prepare("SELECT * FROM meetings WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT ?")
    .all(limit);
  return meetings.map(buildClosedMeeting);
}

function getLatestWarnings() {
  const meeting = db
    .prepare(
      "SELECT * FROM meetings WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1",
    )
    .get();
  if (!meeting) return null;

  return {
    meeting: buildClosedMeeting(meeting),
    absentees: getWarningsForMeeting(meeting.id),
  };
}

function getState() {
  return {
    members: getMembers(),
    activeMeeting: getActiveMeeting(),
    history: getHistory(),
    latestWarnings: getLatestWarnings(),
  };
}

function addOrUpdateMember(name, email) {
  const cleanName = normalizeName(name);
  const cleanEmail = normalizeEmail(email);
  const existing = db.prepare("SELECT id FROM members WHERE email = ?").get(cleanEmail);
  const timestamp = nowIso();

  if (existing) {
    db.prepare("UPDATE members SET name = ?, email = ?, updated_at = ? WHERE id = ?").run(
      cleanName,
      cleanEmail,
      timestamp,
      existing.id,
    );
    return db.prepare("SELECT id, name, email FROM members WHERE id = ?").get(existing.id);
  }

  const id = createId();
  db.prepare(
    "INSERT INTO members (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, cleanName, cleanEmail, timestamp, timestamp);
  return db.prepare("SELECT id, name, email FROM members WHERE id = ?").get(id);
}

function removeMember(id) {
  assertNoActiveMeeting("Close the active meeting before removing members.");
  db.prepare("DELETE FROM members WHERE id = ?").run(id);
}

function clearMembers() {
  assertNoActiveMeeting("Close the active meeting before clearing members.");
  db.prepare("DELETE FROM members").run();
}

function replaceMembers(members) {
  assertNoActiveMeeting("Close the active meeting before replacing members.");
  const tx = db.transaction((items) => {
    db.prepare("DELETE FROM members").run();
    for (const member of items) {
      addOrUpdateMember(member.name, member.email);
    }
  });
  tx(members);
}

function startMeeting(title, date) {
  if (getActiveMeeting()) {
    throw new Error("A meeting is already live. Close it before starting another.");
  }

  const memberCount = db.prepare("SELECT COUNT(*) AS count FROM members").get().count;
  if (!memberCount) {
    throw new Error("Save your GDC members before starting attendance.");
  }

  const id = createId();
  const startedAt = nowIso();
  db.prepare(
    "INSERT INTO meetings (id, title, date, started_at, total_members) VALUES (?, ?, ?, ?, ?)",
  ).run(id, title, date, startedAt, memberCount);

  return getActiveMeeting();
}

function markPresent({ memberId, email, name }) {
  const meeting = getActiveMeeting();
  if (!meeting) {
    throw new Error("Start the meeting first.");
  }

  const member = findMember({ memberId, email, name });
  if (!member) {
    throw new Error("No saved GDC member matches that name or email.");
  }

  const markedAt = nowIso();
  db.prepare(
    "INSERT OR IGNORE INTO attendance (meeting_id, member_id, marked_at) VALUES (?, ?, ?)",
  ).run(meeting.id, member.id, markedAt);

  return member;
}

function closeActiveMeeting(buildMail) {
  const meeting = getActiveMeeting();
  if (!meeting) {
    throw new Error("No meeting is live.");
  }

  const members = getMembers();
  const attendance = getAttendanceMap(meeting.id);
  const closedAt = nowIso();

  const tx = db.transaction(() => {
    db.prepare("UPDATE meetings SET closed_at = ?, total_members = ? WHERE id = ?").run(
      closedAt,
      members.length,
      meeting.id,
    );

    for (const member of members) {
      const markedAt = attendance[member.id] || null;
      const status = markedAt ? "present" : "absent";
      db.prepare(
        `INSERT INTO meeting_members
          (meeting_id, member_id, name, email, status, marked_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(meeting.id, member.id, member.name, member.email, status, markedAt);

      if (status === "absent") {
        const mail = buildMail(member, { ...meeting, closedAt });
        db.prepare(
          `INSERT INTO warning_delivery
            (meeting_id, member_id, name, email, subject, body, status, message, detail, sent_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', 'Sending', '', NULL, ?)`,
        ).run(
          meeting.id,
          member.id,
          member.name,
          member.email,
          mail.subject,
          mail.body,
          closedAt,
        );
      }
    }
  });

  tx();
  return buildClosedMeeting(db.prepare("SELECT * FROM meetings WHERE id = ?").get(meeting.id));
}

function updateWarningDelivery(meetingId, memberId, delivery) {
  db.prepare(
    `UPDATE warning_delivery
     SET status = ?, message = ?, detail = ?, sent_at = ?, updated_at = ?
     WHERE meeting_id = ? AND member_id = ?`,
  ).run(
    delivery.status,
    delivery.message,
    delivery.detail || "",
    delivery.sentAt || null,
    nowIso(),
    meetingId,
    memberId,
  );
}

function clearHistory() {
  db.prepare("DELETE FROM meetings WHERE closed_at IS NOT NULL").run();
}

function importClientState(payload) {
  if (getMembers().length) {
    return false;
  }

  const members = Array.isArray(payload.members) ? payload.members : [];
  if (!members.length) {
    return false;
  }

  const tx = db.transaction(() => {
    for (const member of members) {
      addOrUpdateMember(member.name, member.email);
    }
  });
  tx();
  return true;
}

function findMember({ memberId, email, name }) {
  if (memberId) {
    const member = db.prepare("SELECT id, name, email FROM members WHERE id = ?").get(memberId);
    if (member) return member;
  }

  const cleanEmail = normalizeEmail(email);
  if (cleanEmail) {
    const member = db
      .prepare("SELECT id, name, email FROM members WHERE email = ?")
      .get(cleanEmail);
    if (member) return member;
  }

  const cleanName = normalizeName(name).toLowerCase();
  if (cleanName) {
    return (
      db
        .prepare(
          "SELECT id, name, email FROM members WHERE lower(name) = ? ORDER BY name COLLATE NOCASE LIMIT 1",
        )
        .get(cleanName) || null
    );
  }

  return null;
}

function buildActiveMeeting(meeting) {
  return {
    id: meeting.id,
    title: meeting.title,
    date: meeting.date,
    startedAt: meeting.started_at,
    attendance: getAttendanceMap(meeting.id),
  };
}

function buildClosedMeeting(meeting) {
  const rows = getMeetingMembers(meeting.id);
  return {
    id: meeting.id,
    title: meeting.title,
    date: meeting.date,
    startedAt: meeting.started_at,
    closedAt: meeting.closed_at,
    totalMembers: meeting.total_members,
    present: rows
      .filter((row) => row.status === "present")
      .map(meetingMemberToSnapshot),
    absent: rows
      .filter((row) => row.status === "absent")
      .map(meetingMemberToSnapshot),
    mailDelivery: getDeliverySummary(meeting.id),
  };
}

function getAttendanceMap(meetingId) {
  const rows = db
    .prepare("SELECT member_id, marked_at FROM attendance WHERE meeting_id = ?")
    .all(meetingId);
  return Object.fromEntries(rows.map((row) => [row.member_id, row.marked_at]));
}

function getMeetingMembers(meetingId) {
  return db
    .prepare(
      `SELECT meeting_id, member_id, name, email, status, marked_at
       FROM meeting_members
       WHERE meeting_id = ?
       ORDER BY name COLLATE NOCASE`,
    )
    .all(meetingId);
}

function getWarningsForMeeting(meetingId) {
  return db
    .prepare(
      `SELECT member_id AS id, name, email, subject, body, status, message, detail, sent_at
       FROM warning_delivery
       WHERE meeting_id = ?
       ORDER BY name COLLATE NOCASE`,
    )
    .all(meetingId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      body: row.body,
      delivery: {
        status: row.status,
        message: row.message,
        detail: row.detail || "",
        sentAt: row.sent_at || null,
      },
    }));
}

function meetingMemberToSnapshot(row) {
  return {
    id: row.member_id,
    name: row.name,
    email: row.email,
    markedAt: row.marked_at,
  };
}

function getDeliverySummary(meetingId) {
  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM warning_delivery WHERE meeting_id = ? GROUP BY status")
    .all(meetingId);
  return Object.assign(
    { sent: 0, failed: 0, draft: 0, pending: 0 },
    Object.fromEntries(rows.map((row) => [row.status, row.count])),
  );
}

function assertNoActiveMeeting(message) {
  if (getActiveMeeting()) {
    throw new Error(message);
  }
}

module.exports = {
  DB_PATH,
  getState,
  getMembers,
  addOrUpdateMember,
  removeMember,
  clearMembers,
  replaceMembers,
  startMeeting,
  markPresent,
  closeActiveMeeting,
  updateWarningDelivery,
  clearHistory,
  importClientState,
};
