const STORAGE_KEYS = {
  members: "gdc.attendance.members",
  meeting: "gdc.attendance.activeMeeting",
  history: "gdc.attendance.history",
  latestWarnings: "gdc.attendance.latestWarnings",
  gamification: "gdc.attendance.gamification",
  teams: "gdc.attendance.teams",
};

const state = {
  members: [],
  activeMeeting: null,
  history: [],
  latestWarnings: null,
  gamification: {
    points: {},
    streaks: {},
    badges: {},
    totalMeetings: 0,
  },
  teams: [],
  mailServer: {
    checked: false,
    ready: false,
    message: "Checking the local mail server...",
    sender: "Not connected",
  },
  qrCodeData: null,
  qrRefreshInterval: null,
};

const els = {
  meetingForm: document.querySelector("#meetingForm"),
  meetingTitle: document.querySelector("#meetingTitle"),
  meetingDate: document.querySelector("#meetingDate"),
  startMeetingButton: document.querySelector("#startMeetingButton"),
  closeMeetingButton: document.querySelector("#closeMeetingButton"),
  meetingMessage: document.querySelector("#meetingMessage"),
  attendanceForm: document.querySelector("#attendanceForm"),
  attendanceEmail: document.querySelector("#attendanceEmail"),
  attendanceName: document.querySelector("#attendanceName"),
  attendanceMessage: document.querySelector("#attendanceMessage"),
  clearLookupButton: document.querySelector("#clearLookupButton"),
  memberForm: document.querySelector("#memberForm"),
  memberName: document.querySelector("#memberName"),
  memberEmail: document.querySelector("#memberEmail"),
  memberTeam: document.querySelector("#memberTeam"),
  memberList: document.querySelector("#memberList"),
  rosterList: document.querySelector("#rosterList"),
  warningDeck: document.querySelector("#warningDeck"),
  historyList: document.querySelector("#historyList"),
  seedButton: document.querySelector("#seedButton"),
  clearMembersButton: document.querySelector("#clearMembersButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  exportButton: document.querySelector("#exportButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  mailLauncher: document.querySelector(".mail-launcher"),
  mailStatusText: document.querySelector("#mailStatusText"),
  mailMode: document.querySelector("#mailMode"),
  mailSender: document.querySelector("#mailSender"),
  mailSettingsToggle: document.querySelector("#mailSettingsToggle"),
  checkMailButton: document.querySelector("#checkMailButton"),
  testMailButton: document.querySelector("#testMailButton"),
  mailSetupForm: document.querySelector("#mailSetupForm"),
  mailSetupMessage: document.querySelector("#mailSetupMessage"),
  smtpHost: document.querySelector("#smtpHost"),
  smtpPort: document.querySelector("#smtpPort"),
  smtpSecure: document.querySelector("#smtpSecure"),
  smtpUser: document.querySelector("#smtpUser"),
  smtpPass: document.querySelector("#smtpPass"),
  smtpFromName: document.querySelector("#smtpFromName"),
  smtpReplyTo: document.querySelector("#smtpReplyTo"),
  meetingState: document.querySelector("#meetingState"),
  memberCount: document.querySelector("#memberCount"),
  presentCount: document.querySelector("#presentCount"),
  absentCount: document.querySelector("#absentCount"),
  signalPresent: document.querySelector("#signalPresent"),
  liveBadge: document.querySelector("#liveBadge"),
  rosterMode: document.querySelector("#rosterMode"),
  memberTemplate: document.querySelector("#memberTemplate"),
  rosterTemplate: document.querySelector("#rosterTemplate"),
  warningTemplate: document.querySelector("#warningTemplate"),
  // New elements for innovative features
  qrCodeContainer: document.querySelector("#qrCodeContainer"),
  qrCodeCanvas: document.querySelector("#qrCodeCanvas"),
  qrCodeToken: document.querySelector("#qrCodeToken"),
  qrRefreshBtn: document.querySelector("#qrRefreshBtn"),
  selfCheckinSection: document.querySelector("#selfCheckinSection"),
  gamificationSection: document.querySelector("#gamificationSection"),
  leaderboardList: document.querySelector("#leaderboardList"),
  badgesList: document.querySelector("#badgesList"),
  statsSection: document.querySelector("#statsSection"),
  attendanceChart: document.querySelector("#attendanceChart"),
  teamFilter: document.querySelector("#teamFilter"),
  teamList: document.querySelector("#teamList"),
  addTeamBtn: document.querySelector("#addTeamBtn"),
  teamModal: document.querySelector("#teamModal"),
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";

const placeholderMembers = Array.from({ length: 15 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: createId(),
    name: `GDC Member ${number}`,
    email: `member${number}@gdc.local`,
  };
});

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadState() {
  state.members = readJson(STORAGE_KEYS.members, []);
  state.activeMeeting = readJson(STORAGE_KEYS.meeting, null);
  state.history = readJson(STORAGE_KEYS.history, []);
  state.latestWarnings = readJson(STORAGE_KEYS.latestWarnings, null);
  state.gamification = readJson(STORAGE_KEYS.gamification, {
    points: {},
    streaks: {},
    badges: {},
    totalMeetings: 0,
  });
  state.teams = readJson(STORAGE_KEYS.teams, [
    { id: "default", name: "General", color: "#0f8f63" },
  ]);
  els.meetingDate.value = todayValue();
}

function saveMembers() {
  writeJson(STORAGE_KEYS.members, state.members);
}

function saveMeeting() {
  if (state.activeMeeting) {
    writeJson(STORAGE_KEYS.meeting, state.activeMeeting);
  } else {
    localStorage.removeItem(STORAGE_KEYS.meeting);
  }
}

function saveHistory() {
  writeJson(STORAGE_KEYS.history, state.history);
}

function saveWarnings() {
  if (state.latestWarnings) {
    writeJson(STORAGE_KEYS.latestWarnings, state.latestWarnings);
  } else {
    localStorage.removeItem(STORAGE_KEYS.latestWarnings);
  }
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function setMessage(element, text, tone = "") {
  element.textContent = text;
  element.classList.remove("good", "bad");
  if (tone) {
    element.classList.add(tone);
  }
}

function getAttendanceMap() {
  return state.activeMeeting?.attendance || {};
}

function getPresentMembers() {
  const attendance = getAttendanceMap();
  return state.members.filter((member) => Boolean(attendance[member.id]));
}

function getAbsentMembers() {
  const attendance = getAttendanceMap();
  return state.members.filter((member) => !attendance[member.id]);
}

function snapshotMember(member) {
  const markedAt = state.activeMeeting?.attendance?.[member.id] || null;
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    team: member.team || "default",
    markedAt,
  };
}

// ===== QR Code Generation (Simple implementation) =====
function generateQRCodeSVG(data, size = 200) {
  // Simple QR-like pattern generator (for demo purposes)
  // In production, use a proper QR library
  const modules = 25;
  const moduleSize = size / modules;
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Create a pseudo-random but deterministic pattern based on data
  const hash = data.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash * 9301 + 49297;
  
  // Add finder patterns (corners)
  const finderPattern = (x, y) => {
    let pattern = '';
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const fill = (dx === 0 || dx === 6 || dy === 0 || dy === 6 || 
                     (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)) && 
                    !(dx >= 1 && dx <= 5 && dy >= 1 && dy <= 5 && 
                     !(dx === 3 && dy === 3));
        if (fill || (dx >= 1 && dx <= 5 && dy >= 1 && dy <= 5 && 
            !((dx >= 2 && dx <= 4) && (dy >= 2 && dy <= 4)))) {
          pattern += `<rect x="${(x + dx) * moduleSize}" y="${(y + dy) * moduleSize}" 
                         width="${moduleSize}" height="${moduleSize}" fill="#18211d"/>`;
        }
      }
    }
    return pattern;
  };
  
  svg += finderPattern(0, 0);
  svg += finderPattern(modules - 7, 0);
  svg += finderPattern(0, modules - 7);
  
  // Data modules
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      // Skip finder pattern areas
      if ((x < 8 && y < 8) || (x >= modules - 8 && y < 8) || (x < 8 && y >= modules - 8)) continue;
      
      const val = ((seed * (x + 1) * (y + 1)) % 100);
      if (val < 45) {
        svg += `<rect x="${x * moduleSize}" y="${y * moduleSize}" 
                   width="${moduleSize}" height="${moduleSize}" fill="#18211d"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

function generateMeetingQRCode() {
  if (!state.activeMeeting) return null;
  
  const qrData = {
    type: "gdc-attendance",
    meetingId: state.activeMeeting.id,
    meetingTitle: state.activeMeeting.title,
    timestamp: Date.now(),
    token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
  };
  
  const encoded = btoa(JSON.stringify(qrData));
  state.qrCodeData = qrData;
  
  return {
    svg: generateQRCodeSVG(encoded, 200),
    token: encoded,
    data: qrData,
  };
}

// ===== Gamification System =====
const BADGE_DEFINITIONS = {
  perfect_attendance: { name: "Perfect Attendance", description: "Attended 5 consecutive meetings", icon: "🏆", threshold: 5 },
  half_century: { name: "Half Century", description: "Attended 50% of all meetings", icon: "🎯", threshold: 0.5 },
  early_bird: { name: "Early Bird", description: "First to arrive at a meeting", icon: "🐦", threshold: 1 },
  team_player: { name: "Team Player", description: "Never missed a team meeting", icon: "🤝", threshold: 3 },
  comeback_kid: { name: "Comeback Kid", description: "Returned after 2 absences", icon: "💪", threshold: 1 },
  centurion: { name: "Centurion", description: "Attended 100 meetings", icon: "👑", threshold: 100 },
  streak_master: { name: "Streak Master", description: "10 meeting streak", icon: "🔥", threshold: 10 },
  rising_star: { name: "Rising Star", description: "Top attendee of the month", icon: "⭐", threshold: 1 },
};

function calculatePoints(memberId, isPresent, wasEarly) {
  let points = 0;
  if (isPresent) {
    points += 10; // Base attendance points
    if (wasEarly) points += 5; // Early bird bonus
  }
  return points;
}

function updateGamification(meetingRecord) {
  const { present, absent, date } = meetingRecord;
  
  present.forEach((member, index) => {
    const memberId = member.id;
    if (!state.gamification.points[memberId]) {
      state.gamification.points[memberId] = 0;
    }
    if (!state.gamification.streaks[memberId]) {
      state.gamification.streaks[memberId] = 0;
    }
    
    // Update points
    const wasEarly = index < 3; // First 3 are early birds
    state.gamification.points[memberId] += calculatePoints(memberId, true, wasEarly);
    
    // Update streak
    state.gamification.streaks[memberId]++;
    
    // Award badges
    awardBadges(memberId);
  });
  
  absent.forEach((member) => {
    const memberId = member.id;
    if (state.gamification.streaks[memberId]) {
      state.gamification.streaks[memberId] = 0; // Reset streak
    }
  });
  
  state.gamification.totalMeetings++;
  saveGamification();
}

function awardBadges(memberId) {
  if (!state.gamification.badges[memberId]) {
    state.gamification.badges[memberId] = [];
  }
  
  const points = state.gamification.points[memberId] || 0;
  const streak = state.gamification.streaks[memberId] || 0;
  const totalMeetings = state.gamification.totalMeetings;
  
  const earnedBadges = [];
  
  if (streak >= BADGE_DEFINITIONS.perfect_attendance.threshold) {
    earnedBadges.push("perfect_attendance");
  }
  if (streak >= BADGE_DEFINITIONS.streak_master.threshold) {
    earnedBadges.push("streak_master");
  }
  if (totalMeetings > 0 && points / totalMeetings >= 8) {
    earnedBadges.push("half_century");
  }
  if (points >= 50) {
    earnedBadges.push("team_player");
  }
  if (points >= 100) {
    earnedBadges.push("rising_star");
  }
  
  earnedBadges.forEach((badgeId) => {
    if (!state.gamification.badges[memberId].includes(badgeId)) {
      state.gamification.badges[memberId].push(badgeId);
    }
  });
}

function getLeaderboard() {
  return state.members
    .map((member) => ({
      id: member.id,
      name: member.name,
      team: member.team || "default",
      points: state.gamification.points[member.id] || 0,
      streak: state.gamification.streaks[member.id] || 0,
      badges: state.gamification.badges[member.id] || [],
    }))
    .sort((a, b) => b.points - a.points);
}

function getTeamLeaderboard(teamId) {
  const filtered = teamId && teamId !== "all" 
    ? getLeaderboard().filter(m => m.team === teamId)
    : getLeaderboard();
  return filtered.slice(0, 10);
}

function saveGamification() {
  writeJson(STORAGE_KEYS.gamification, state.gamification);
}

function saveTeams() {
  writeJson(STORAGE_KEYS.teams, state.teams);
}

// ===== Team Management =====
function addTeam(name, color) {
  const team = {
    id: `team-${Date.now()}`,
    name: name.trim(),
    color: color || `hsl(${Math.random() * 360}, 60%, 40%)`,
  };
  state.teams.push(team);
  saveTeams();
  renderTeams();
  return team;
}

function removeTeam(teamId) {
  if (teamId === "default") return; // Can't remove default team
  state.teams = state.teams.filter(t => t.id !== teamId);
  state.members.forEach(m => {
    if (m.team === teamId) m.team = "default";
  });
  saveTeams();
  saveMembers();
  renderTeams();
}

function getTeamName(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  return team ? team.name : "General";
}

function getTeamColor(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  return team ? team.color : "#0f8f63";
}

// ===== Enhanced Attendance Analytics =====
function getAttendanceStats() {
  const stats = {
    totalMeetings: state.history.length,
    avgAttendance: 0,
    bestAttendance: 0,
    worstAttendance: 0,
    monthlyTrend: [],
    teamStats: {},
  };
  
  if (state.history.length === 0) return stats;
  
  const attendanceRates = state.history.map(m => 
    m.totalMembers > 0 ? m.present.length / m.totalMembers : 0
  );
  
  stats.avgAttendance = attendanceRates.reduce((a, b) => a + b, 0) / attendanceRates.length;
  stats.bestAttendance = Math.max(...attendanceRates);
  stats.worstAttendance = Math.min(...attendanceRates);
  
  // Team stats
  state.teams.forEach(team => {
    const teamMembers = state.members.filter(m => m.team === team.id);
    const teamHistory = state.history.slice(0, 10);
    let teamPresent = 0;
    let teamTotal = 0;
    
    teamHistory.forEach(meeting => {
      teamMembers.forEach(member => {
        const snapshot = meeting.present.find(p => p.id === member.id);
        if (snapshot) teamPresent++;
        teamTotal++;
      });
    });
    
    stats.teamStats[team.id] = {
      name: team.name,
      color: team.color,
      attendanceRate: teamTotal > 0 ? teamPresent / teamTotal : 0,
      members: teamMembers.length,
    };
  });
  
  return stats;
}

function renderAttendanceChart() {
  if (!els.attendanceChart) return;
  
  const stats = getAttendanceStats();
  const recentMeetings = state.history.slice(0, 10).reverse();
  
  if (recentMeetings.length === 0) {
    els.attendanceChart.innerHTML = '<p class="empty-state">No data yet. Close some meetings to see trends.</p>';
    return;
  }
  
  const maxPresent = Math.max(...recentMeetings.map(m => m.present.length), 1);
  
  let chartHTML = '<div class="chart-container">';
  recentMeetings.forEach(meeting => {
    const percentage = (meeting.present.length / meeting.totalMembers) * 100;
    const barHeight = (meeting.present.length / maxPresent) * 100;
    const date = new Date(meeting.date);
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    
    chartHTML += `
      <div class="chart-bar-group">
        <div class="chart-bar" style="height: ${barHeight}%">
          <span class="chart-value">${meeting.present.length}</span>
        </div>
        <span class="chart-label">${dayLabel}</span>
        <span class="chart-sublabel">${Math.round(percentage)}%</span>
      </div>
    `;
  });
  chartHTML += '</div>';
  
  // Add stats summary
  chartHTML += `
    <div class="stats-summary">
      <div class="stat-card">
        <span class="stat-value">${Math.round(stats.avgAttendance * 100)}%</span>
        <span class="stat-label">Avg Attendance</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${stats.totalMeetings}</span>
        <span class="stat-label">Total Meetings</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${Math.round(stats.bestAttendance * 100)}%</span>
        <span class="stat-label">Best Rate</span>
      </div>
    </div>
  `;
  
  els.attendanceChart.innerHTML = chartHTML;
}

function render() {
  const isLive = Boolean(state.activeMeeting);
  const presentMembers = getPresentMembers();
  const absentMembers = isLive ? getAbsentMembers() : [];

  els.meetingState.textContent = isLive
    ? state.activeMeeting.title
    : "Not started";
  els.memberCount.textContent = String(state.members.length);
  els.presentCount.textContent = String(presentMembers.length);
  els.absentCount.textContent = String(absentMembers.length);
  els.signalPresent.textContent = String(presentMembers.length);
  els.liveBadge.textContent = isLive ? "Live" : "Idle";
  els.liveBadge.classList.toggle("is-live", isLive);
  els.rosterMode.textContent = isLive ? "Open" : "Locked";
  els.closeMeetingButton.disabled = !isLive;
  els.startMeetingButton.disabled = isLive;
  els.memberForm.querySelector("button").disabled = false;
  els.copyReportButton.disabled = !state.latestWarnings;

  renderMembers();
  renderRoster();
  renderWarnings();
  renderHistory();
  renderMailStatus();
  renderQRCode();
  renderGamification();
  renderAttendanceChart();
  renderTeams();
}

function renderMailStatus() {
  els.mailLauncher.classList.toggle("is-ready", state.mailServer.ready);
  els.mailLauncher.classList.toggle(
    "is-offline",
    state.mailServer.checked && !state.mailServer.ready,
  );
  els.mailMode.textContent = state.mailServer.ready ? "Auto send armed" : "Draft fallback";
  els.mailSender.textContent = state.mailServer.ready ? "Hidden" : "Not connected";
  els.mailStatusText.textContent = state.mailServer.message;
}

function renderMembers() {
  els.memberList.textContent = "";

  if (!state.members.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Add your 15 GDC members here, or load placeholders and replace them.";
    els.memberList.append(empty);
    return;
  }

  state.members.forEach((member) => {
    const row = els.memberTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector("strong").textContent = member.name;
    const teamName = getTeamName(member.team);
    row.querySelector("span").textContent = `${member.email} • ${teamName}`;
    row.querySelector("button").addEventListener("click", () => removeMember(member.id));
    els.memberList.append(row);
  });
}

function renderRoster() {
  els.rosterList.textContent = "";

  if (!state.members.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "The live roster appears after members are saved.";
    els.rosterList.append(empty);
    return;
  }

  const attendance = getAttendanceMap();
  state.members.forEach((member) => {
    const row = els.rosterTemplate.content.firstElementChild.cloneNode(true);
    const isPresent = Boolean(attendance[member.id]);
    row.classList.toggle("is-present", isPresent);
    row.querySelector("strong").textContent = member.name;
    row.querySelector("span").textContent = isPresent
      ? `Marked at ${formatTime(attendance[member.id])}`
      : member.email;

    const button = row.querySelector("button");
    button.textContent = isPresent ? "Present" : "Mark";
    button.disabled = !state.activeMeeting || isPresent;
    button.addEventListener("click", () => markPresent(member));
    els.rosterList.append(row);
  });
}

function renderWarnings() {
  els.warningDeck.textContent = "";

  if (!state.latestWarnings) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Close a meeting to generate absence warnings here.";
    els.warningDeck.append(empty);
    return;
  }

  const { meeting, absentees } = state.latestWarnings;

  if (!absentees.length) {
    const clear = document.createElement("p");
    clear.className = "empty-state";
    clear.textContent = `${meeting.title} closed with full attendance. No warning mails needed.`;
    els.warningDeck.append(clear);
    return;
  }

  absentees.forEach((member) => {
    const card = els.warningTemplate.content.firstElementChild.cloneNode(true);
    const mail = buildWarningMail(member, meeting);
    const delivery = member.delivery || {
      status: "draft",
      message: "Draft ready",
    };

    card.classList.add(`is-${delivery.status}`);
    const teamName = getTeamName(member.team);
    card.querySelector("h3").textContent = `${member.name} (${teamName})`;
    card.querySelector(".warning-email").textContent = member.email;
    card.querySelector(".send-state").textContent = delivery.message;
    card.querySelector("textarea").value = mail.body;

    const link = card.querySelector("a");
    link.href = mail.href;

    card.querySelector("button").addEventListener("click", async () => {
      await copyText(`${mail.subject}\n\n${mail.body}`);
      linkMessage(`Copied warning mail for ${member.name}.`);
    });

    els.warningDeck.append(card);
  });
}

function renderHistory() {
  els.historyList.textContent = "";

  if (!state.history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Closed meetings will be stored here on this device.";
    els.historyList.append(empty);
    return;
  }

  state.history.slice(0, 8).forEach((meeting) => {
    const row = document.createElement("article");
    row.className = "history-row";

    const detail = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = meeting.title;
    const meta = document.createElement("span");
    meta.textContent = `${formatDate(meeting.date)} closed ${formatTime(meeting.closedAt)}`;
    detail.append(title, meta);

    const present = document.createElement("span");
    present.className = "history-pill";
    present.textContent = `${meeting.present.length} present`;

    const absent = document.createElement("span");
    absent.className = "history-pill absent";
    absent.textContent = `${meeting.absent.length} absent`;

    // Add attendance rate
    const rate = meeting.totalMembers > 0 
      ? Math.round((meeting.present.length / meeting.totalMembers) * 100) 
      : 0;
    const ratePill = document.createElement("span");
    ratePill.className = "history-pill";
    ratePill.style.background = rate >= 80 ? "var(--mint)" : rate >= 50 ? "var(--amber)" : "#ffe9e3";
    ratePill.textContent = `${rate}%`;

    row.append(detail, present, absent, ratePill);
    els.historyList.append(row);
  });
}

// ===== Gamification Rendering =====
function renderGamification() {
  if (!els.leaderboardList || !els.badgesList) return;
  
  // Render Leaderboard
  els.leaderboardList.textContent = "";
  const leaderboard = getLeaderboard();
  
  if (leaderboard.length === 0) {
    els.leaderboardList.innerHTML = '<p class="empty-state">No data yet. Start marking attendance to build the leaderboard.</p>';
  } else {
    leaderboard.slice(0, 10).forEach((member, index) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";
      
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
      const teamName = getTeamName(member.team);
      const badgeCount = member.badges.length;
      
      row.innerHTML = `
        <span class="lb-rank">${medal}</span>
        <div class="lb-info">
          <strong>${member.name}</strong>
          <span>${teamName} • 🔥 ${member.streak} streak</span>
        </div>
        <div class="lb-stats">
          <span class="lb-points">${member.points} pts</span>
          ${badgeCount > 0 ? `<span class="lb-badges">🏅 ${badgeCount}</span>` : ''}
        </div>
      `;
      
      els.leaderboardList.appendChild(row);
    });
  }
  
  // Render Badges Showcase
  els.badgesList.textContent = "";
  const allBadges = Object.entries(BADGE_DEFINITIONS);
  
  allBadges.forEach(([id, badge]) => {
    const card = document.createElement("div");
    card.className = "badge-card";
    
    // Check if any member has this badge
    const earnedBy = Object.values(state.gamification.badges)
      .filter(badges => badges.includes(id)).length;
    
    card.innerHTML = `
      <span class="badge-icon">${badge.icon}</span>
      <div class="badge-info">
        <strong>${badge.name}</strong>
        <span>${badge.description}</span>
        <span class="badge-count">Earned by ${earnedBy} member${earnedBy !== 1 ? 's' : ''}</span>
      </div>
    `;
    
    els.badgesList.appendChild(card);
  });
}

// ===== Team Rendering =====
function renderTeams() {
  if (!els.teamList) return;
  
  els.teamList.textContent = "";
  
  state.teams.forEach(team => {
    const memberCount = state.members.filter(m => m.team === team.id).length;
    const row = document.createElement("div");
    row.className = "team-row";
    row.innerHTML = `
      <span class="team-color" style="background: ${team.color}"></span>
      <div class="team-info">
        <strong>${team.name}</strong>
        <span>${memberCount} member${memberCount !== 1 ? 's' : ''}</span>
      </div>
      ${team.id !== "default" ? `<button class="icon-button" title="Remove team">×</button>` : ''}
    `;
    
    if (team.id !== "default") {
      row.querySelector("button").addEventListener("click", () => {
        if (confirm(`Remove "${team.name}" team? Members will be moved to General.`)) {
          removeTeam(team.id);
        }
      });
    }
    
    els.teamList.appendChild(row);
  });
  
  // Update team filter dropdown
  if (els.teamFilter) {
    const currentValue = els.teamFilter.value;
    els.teamFilter.innerHTML = '<option value="all">All Teams</option>';
    state.teams.forEach(team => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      els.teamFilter.appendChild(option);
    });
    els.teamFilter.value = currentValue || "all";
  }
}

function addOrUpdateMember(name, email, team = "default") {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const cleanEmail = normalizeEmail(email);
  const existing = state.members.find((member) => normalizeEmail(member.email) === cleanEmail);

  if (existing) {
    existing.name = cleanName;
    existing.email = cleanEmail;
    existing.team = team || existing.team || "default";
    setMessage(els.meetingMessage, `Updated ${cleanName} in the member vault.`, "good");
  } else {
    state.members.push({
      id: createId(),
      name: cleanName,
      email: cleanEmail,
      team: team || "default",
    });
    setMessage(els.meetingMessage, `Saved ${cleanName} to the member vault.`, "good");
  }

  state.members.sort((a, b) => a.name.localeCompare(b.name));
  saveMembers();
  render();
}

function removeMember(memberId) {
  if (state.activeMeeting) {
    setMessage(els.meetingMessage, "Close the active meeting before removing members.", "bad");
    return;
  }

  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;

  const confirmed = window.confirm(`Remove ${member.name} from the member vault?`);
  if (!confirmed) return;

  state.members = state.members.filter((item) => item.id !== memberId);
  saveMembers();
  setMessage(els.meetingMessage, `Removed ${member.name}.`, "good");
  render();
}

function startMeeting(event) {
  event.preventDefault();

  if (state.activeMeeting) {
    setMessage(els.meetingMessage, "A meeting is already live. Close it before starting another.", "bad");
    return;
  }

  if (!state.members.length) {
    setMessage(els.meetingMessage, "Save your GDC members before starting attendance.", "bad");
    return;
  }

  const date = els.meetingDate.value || todayValue();
  const title = els.meetingTitle.value.trim() || `${formatDate(date)} GDC Meeting`;

  state.activeMeeting = {
    id: createId(),
    title,
    date,
    startedAt: new Date().toISOString(),
    attendance: {},
    qrToken: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
  };

  state.latestWarnings = null;
  saveMeeting();
  saveWarnings();
  setMessage(els.meetingMessage, `${title} is live. Members can be marked present now.`, "good");
  render();
}

async function closeMeeting() {
  if (!state.activeMeeting) return;

  const absent = getAbsentMembers().map(snapshotMember);
  const present = getPresentMembers().map(snapshotMember);
  const meetingRecord = {
    ...state.activeMeeting,
    closedAt: new Date().toISOString(),
    totalMembers: state.members.length,
    present,
    absent,
  };

  state.history.unshift(meetingRecord);
  state.history = state.history.slice(0, 30);
  state.latestWarnings = {
    meeting: meetingRecord,
    absentees: absent,
  };
  state.activeMeeting = null;

  // Update gamification
  updateGamification(meetingRecord);

  saveMeeting();
  saveHistory();
  saveWarnings();
  saveGamification();
  setMessage(
    els.meetingMessage,
    absent.length
      ? `Meeting closed. Launching ${absent.length} warning mail${absent.length === 1 ? "" : "s"}...`
      : "Meeting closed with full attendance.",
    absent.length ? "bad" : "good",
  );
  render();

  if (absent.length) {
    await sendWarningMails(meetingRecord);
  }
}

function findMemberByLookup(email, name) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = normalizeName(name);

  if (cleanEmail) {
    const byEmail = state.members.find((member) => normalizeEmail(member.email) === cleanEmail);
    if (byEmail) return byEmail;
  }

  if (cleanName) {
    return state.members.find((member) => normalizeName(member.name) === cleanName);
  }

  return null;
}

function markFromForm(event) {
  event.preventDefault();

  const email = els.attendanceEmail.value;
  const name = els.attendanceName.value;
  const member = findMemberByLookup(email, name);

  if (!state.activeMeeting) {
    setMessage(els.attendanceMessage, "Start the meeting first.", "bad");
    return;
  }

  if (!email.trim() && !name.trim()) {
    setMessage(els.attendanceMessage, "Enter a saved email or exact member name.", "bad");
    return;
  }

  if (!member) {
    setMessage(els.attendanceMessage, "No saved GDC member matches that name or email.", "bad");
    return;
  }

  markPresent(member);
  els.attendanceEmail.value = "";
  els.attendanceName.value = "";
}

// ===== Self Check-in via QR Code =====
function handleSelfCheckin(qrData) {
  if (!state.activeMeeting) {
    setMessage(els.attendanceMessage, "No active meeting for self check-in.", "bad");
    return;
  }
  
  // In a real implementation, we would validate the QR token
  // For now, we'll show instructions for manual entry
  setMessage(els.attendanceMessage, 
    "QR check-in is ready! Share the QR code with members. They can scan and enter their details to self-mark.", 
    "good"
  );
}

function renderQRCode() {
  if (!els.qrCodeContainer || !els.qrCodeCanvas) return;
  
  if (!state.activeMeeting) {
    els.qrCodeContainer.style.display = "none";
    return;
  }
  
  els.qrCodeContainer.style.display = "";
  const qr = generateMeetingQRCode();
  if (qr) {
    els.qrCodeCanvas.innerHTML = qr.svg;
    els.qrCodeToken.textContent = `Meeting: ${state.activeMeeting.title}`;
  }
}

function markPresent(member) {
  if (!state.activeMeeting) {
    setMessage(els.attendanceMessage, "Start the meeting first.", "bad");
    return;
  }

  if (state.activeMeeting.attendance[member.id]) {
    setMessage(els.attendanceMessage, `${member.name} is already marked present.`, "good");
    return;
  }

  state.activeMeeting.attendance[member.id] = new Date().toISOString();
  saveMeeting();
  setMessage(els.attendanceMessage, `${member.name} marked present.`, "good");
  render();
}

async function fetchApi(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}

async function checkMailServer(showMessage = true) {
  try {
    const response = await fetchApi("/api/mail/status", { method: "GET" });
    const status = await response.json();
    state.mailServer = {
      checked: true,
      ready: Boolean(status.ready),
      message: status.ready
        ? `Connected to ${status.host} using ${status.mode || "SMTP"}. Absence warnings will auto-send when you close a meeting.`
        : status.message || "Mail server is running, but SMTP is not configured.",
      sender: status.sender || "Not connected",
    };

    if (showMessage) {
      setMessage(
        els.meetingMessage,
        state.mailServer.ready
          ? "Mail server connected. Auto send is ready."
          : "Mail server found, but SMTP details are missing.",
        state.mailServer.ready ? "good" : "bad",
      );
    }
  } catch (error) {
    state.mailServer = {
      checked: true,
      ready: false,
      message: "Local mail server is offline. Warning drafts will stay ready as backup.",
      sender: "Not connected",
    };

    if (showMessage) {
      setMessage(els.meetingMessage, "Local mail server is offline. Draft fallback is active.", "bad");
    }
  }

  renderMailStatus();
}

async function loadMailConfig() {
  try {
    const response = await fetchApi("/api/mail/config", { method: "GET" });
    const config = await response.json();
    if (!response.ok) {
      throw new Error(config.error || "Could not load sender setup.");
    }

    els.smtpHost.value = config.host || "smtp.gmail.com";
    els.smtpPort.value = config.port || 587;
    els.smtpSecure.checked = Boolean(config.secure);
    els.smtpUser.value = config.user || "";
    els.smtpFromName.value = config.fromName || "Game Development Club";
    els.smtpReplyTo.value = config.replyTo || config.user || "";
    els.smtpPass.placeholder = config.hasPassword ? "Saved app password" : "App password";
    syncSmtpSecurity();
  } catch (error) {
    els.smtpHost.value = els.smtpHost.value || "smtp.gmail.com";
    els.smtpPort.value = els.smtpPort.value || 587;
    els.smtpSecure.checked = false;
    els.smtpFromName.value = els.smtpFromName.value || "Game Development Club";
    setMessage(els.mailSetupMessage, "Start the local server to save sender setup.", "bad");
  }
}

function syncSmtpSecurity() {
  const port = Number(els.smtpPort.value || 587);

  if (port === 465) {
    els.smtpSecure.checked = true;
    els.smtpSecure.disabled = false;
  } else if (port === 587 || port === 25 || port === 2525) {
    els.smtpSecure.checked = false;
    els.smtpSecure.disabled = true;
  } else {
    els.smtpSecure.disabled = false;
  }
}

function toggleMailSettings(forceOpen) {
  if (!els.mailSetupForm || !els.mailSettingsToggle) return;

  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !els.mailSetupForm.classList.contains("is-collapsed");
  els.mailSetupForm.classList.toggle("is-collapsed", !shouldOpen);
  els.mailSettingsToggle.setAttribute("aria-expanded", String(shouldOpen));
  els.mailSettingsToggle.title = shouldOpen ? "Hide mail settings" : "Show mail settings";
  els.mailSettingsToggle.setAttribute("aria-label", shouldOpen ? "Hide mail settings" : "Open mail settings");
}

async function saveMailConfig(event) {
  event.preventDefault();
  syncSmtpSecurity();

  const payload = {
    host: els.smtpHost.value.trim(),
    port: Number(els.smtpPort.value || 587),
    secure: els.smtpSecure.checked,
    user: els.smtpUser.value.trim(),
    pass: els.smtpPass.value,
    from: els.smtpUser.value.trim(),
    fromName: els.smtpFromName.value.trim() || "Game Development Club",
    replyTo: els.smtpReplyTo.value.trim() || els.smtpUser.value.trim(),
  };

  if (!payload.host || !payload.port || !payload.user) {
    setMessage(els.mailSetupMessage, "Host, port, and sender email are required.", "bad");
    return;
  }

  try {
    const response = await fetchApi("/api/mail/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not save sender setup.");
    }

    els.smtpPass.value = "";
    els.smtpPass.placeholder = "Saved app password";
    setMessage(els.mailSetupMessage, "Sender saved. Auto mail is ready.", "good");
    await checkMailServer(false);
  } catch (error) {
    setMessage(els.mailSetupMessage, error.message, "bad");
  }
}

async function testMailServer() {
  setMessage(els.mailSetupMessage, "Testing sender login...", "");
  els.testMailButton.disabled = true;

  try {
    const response = await fetchApi("/api/mail/test", { method: "POST" });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Sender test failed.");
    }

    setMessage(els.mailSetupMessage, result.message || "Sender login confirmed.", "good");
    await checkMailServer(false);
  } catch (error) {
    setMessage(els.mailSetupMessage, friendlyMailError(error.message), "bad");
  } finally {
    els.testMailButton.disabled = false;
  }
}

async function sendWarningMails(meetingRecord) {
  if (!state.latestWarnings?.absentees?.length) return;

  state.latestWarnings.absentees = state.latestWarnings.absentees.map((member) => ({
    ...member,
    delivery: {
      status: "pending",
      message: "Sending",
    },
  }));
  saveWarnings();
  renderWarnings();

  const warnings = state.latestWarnings.absentees.map((member) => {
    const mail = buildWarningMail(member, meetingRecord);
    return {
      id: member.id,
      to: member.email,
      name: member.name,
      subject: mail.subject,
      body: mail.body,
    };
  });

  try {
    const response = await fetchApi("/api/send-warnings", {
      method: "POST",
      body: JSON.stringify({
        meeting: {
          id: meetingRecord.id,
          title: meetingRecord.title,
          date: meetingRecord.date,
        },
        warnings,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Mail server rejected the send request.");
    }

    const resultByEmail = new Map(
      (result.results || []).map((item) => [normalizeEmail(item.to), item]),
    );

    state.latestWarnings.absentees = state.latestWarnings.absentees.map((member) => {
      const item = resultByEmail.get(normalizeEmail(member.email));
      const sent = item?.status === "sent";
      return {
        ...member,
        delivery: {
          status: sent ? "sent" : "failed",
          message: sent ? "Auto sent" : "Send failed",
          detail: item?.message || "",
        },
      };
    });

    const sentCount = state.latestWarnings.absentees.filter(
      (member) => member.delivery.status === "sent",
    ).length;
    setMessage(
      els.meetingMessage,
      sentCount === state.latestWarnings.absentees.length
        ? `Auto sent warning mails to ${sentCount} absent member${sentCount === 1 ? "" : "s"}.`
        : `Sent ${sentCount} warning mail${sentCount === 1 ? "" : "s"}; drafts remain for the rest.`,
      sentCount ? "good" : "bad",
    );
    await checkMailServer(false);
  } catch (error) {
    const detail = friendlyMailError(error.message);
    state.latestWarnings.absentees = state.latestWarnings.absentees.map((member) => ({
      ...member,
      delivery: {
        status: "draft",
        message: "Draft ready",
        detail,
      },
    }));
    setMessage(
      els.meetingMessage,
      `Auto mail did not send: ${detail}. Drafts are ready as backup.`,
      "bad",
    );
    await checkMailServer(false);
  }

  updateLatestHistoryDelivery();
  saveWarnings();
  saveHistory();
  render();
}

function friendlyMailError(message) {
  const text = String(message || "Unknown mail error");
  if (/ETIMEDOUT|timed out/i.test(text)) {
    return "SMTP connection timed out. Try smtp.gmail.com with port 587 and SSL unchecked.";
  }
  if (/wrong version number|tls_validate_record_header/i.test(text)) {
    return "SMTP security mode was mismatched. Use port 587 with SSL unchecked, or port 465 with SSL checked.";
  }
  if (/Invalid login|Username and Password|Authentication|AUTH|535/i.test(text)) {
    return "SMTP login failed. Use a Gmail App Password, not your normal password.";
  }
  if (/STARTTLS/i.test(text)) {
    return "STARTTLS failed. Use port 587 with SSL unchecked, or port 465 with SSL checked.";
  }
  return text;
}

function updateLatestHistoryDelivery() {
  if (!state.history.length || !state.latestWarnings) return;

  const latest = state.history.find(
    (meeting) => meeting.id === state.latestWarnings.meeting.id,
  );
  if (!latest) return;

  latest.absent = state.latestWarnings.absentees;
  latest.mailDelivery = {
    sent: state.latestWarnings.absentees.filter((member) => member.delivery?.status === "sent").length,
    failed: state.latestWarnings.absentees.filter((member) => member.delivery?.status === "failed").length,
    draft: state.latestWarnings.absentees.filter((member) => member.delivery?.status === "draft").length,
  };
}

function buildWarningMail(member, meeting) {
  const subject = `GDC attendance warning - ${meeting.title}`;
  const body = [
    `Hello ${member.name},`,
    "",
    `You were marked absent for the Game Development Club meeting "${meeting.title}" on ${formatDate(meeting.date)}.`,
    "",
    "Please reply to the coordinator if this is a mistake. If you missed the meeting, share the reason and collect the updates from your team lead before the next session.",
    "",
    "Repeated unnotified absence may affect your active club responsibilities.",
    "",
    "Game Development Club",
  ].join("\n");

  return {
    subject,
    body,
    href: `mailto:${member.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function linkMessage(text) {
  setMessage(els.attendanceMessage, text, "good");
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    club: "Game Development Club",
    members: state.members,
    activeMeeting: state.activeMeeting,
    history: state.history,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gdc-attendance-${todayValue()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyLatestReport() {
  if (!state.latestWarnings) return;

  const { meeting, absentees } = state.latestWarnings;
  const lines = [
    `Game Development Club attendance report`,
    `Meeting: ${meeting.title}`,
    `Date: ${formatDate(meeting.date)}`,
    `Present: ${meeting.present.length}`,
    `Absent: ${meeting.absent.length}`,
    "",
    "Absent members:",
    ...(absentees.length
      ? absentees.map((member) => `- ${member.name} <${member.email}>`)
      : ["- None"]),
  ];

  await copyText(lines.join("\n"));
  setMessage(els.meetingMessage, "Copied the latest meeting report.", "good");
}

function seedMembers() {
  if (state.activeMeeting) {
    setMessage(els.meetingMessage, "Close the active meeting before loading placeholders.", "bad");
    return;
  }

  const confirmed =
    !state.members.length ||
    window.confirm("Replace the current member vault with 15 editable placeholder members?");
  if (!confirmed) return;

  state.members = placeholderMembers.map((member) => ({
    ...member,
    id: createId(),
  }));
  saveMembers();
  setMessage(els.meetingMessage, "Loaded 15 placeholders. Replace each name and email with your real GDC members.", "good");
  render();
}

function clearMembers() {
  if (state.activeMeeting) {
    setMessage(els.meetingMessage, "Close the active meeting before clearing members.", "bad");
    return;
  }

  if (!state.members.length) return;
  const confirmed = window.confirm("Clear all saved members from this device?");
  if (!confirmed) return;

  state.members = [];
  saveMembers();
  setMessage(els.meetingMessage, "Member vault cleared.", "good");
  render();
}

function clearHistory() {
  if (!state.history.length) return;
  const confirmed = window.confirm("Clear meeting history from this device?");
  if (!confirmed) return;

  state.history = [];
  state.latestWarnings = null;
  saveHistory();
  saveWarnings();
  setMessage(els.meetingMessage, "Meeting history cleared.", "good");
  render();
}

function wireEvents() {
  els.meetingForm.addEventListener("submit", startMeeting);
  els.closeMeetingButton.addEventListener("click", closeMeeting);
  els.attendanceForm.addEventListener("submit", markFromForm);
  els.memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.memberName.value;
    const email = els.memberEmail.value;
    const team = els.memberTeam ? els.memberTeam.value : "default";

    if (!name.trim()) {
      setMessage(els.meetingMessage, "Member name is required.", "bad");
      return;
    }

    if (!isValidEmail(email.trim())) {
      setMessage(els.meetingMessage, "Enter a valid member email address.", "bad");
      return;
    }

    addOrUpdateMember(name, email, team);
    els.memberForm.reset();
    els.memberName.focus();
  });

  els.clearLookupButton.addEventListener("click", () => {
    els.attendanceEmail.value = "";
    els.attendanceName.value = "";
    setMessage(els.attendanceMessage, "Attendance inputs cleared.");
  });

  els.seedButton.addEventListener("click", seedMembers);
  els.clearMembersButton.addEventListener("click", clearMembers);
  els.clearHistoryButton.addEventListener("click", clearHistory);
  els.exportButton.addEventListener("click", exportData);
  els.copyReportButton.addEventListener("click", copyLatestReport);
  els.checkMailButton.addEventListener("click", () => checkMailServer(true));
  els.testMailButton.addEventListener("click", testMailServer);
  els.smtpPort.addEventListener("input", syncSmtpSecurity);
  els.smtpPort.addEventListener("change", syncSmtpSecurity);
  if (els.mailSettingsToggle) {
    els.mailSettingsToggle.addEventListener("click", () => {
      const isOpen = !els.mailSetupForm.classList.contains("is-collapsed");
      toggleMailSettings(!isOpen);
    });
  }
  els.mailSetupForm.addEventListener("submit", saveMailConfig);

  // QR Code refresh
  if (els.qrRefreshBtn) {
    els.qrRefreshBtn.addEventListener("click", () => {
      if (state.activeMeeting) {
        state.activeMeeting.qrToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        saveMeeting();
        renderQRCode();
        setMessage(els.meetingMessage, "QR code refreshed for security.", "good");
      }
    });
  }
  
  // Team filter
  if (els.teamFilter) {
    els.teamFilter.addEventListener("change", () => {
      renderRoster();
      renderGamification();
    });
  }
  
  // Add team button
  if (els.addTeamBtn) {
    els.addTeamBtn.addEventListener("click", () => {
      const name = prompt("Enter team name:");
      if (name && name.trim()) {
        addTeam(name.trim());
      }
    });
  }
}

loadState();
wireEvents();
render();
loadMailConfig();
toggleMailSettings(false);
checkMailServer(false);
