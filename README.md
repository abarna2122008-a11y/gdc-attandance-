# Game Development Club Attendance - Innovative Edition

A modern, feature-rich attendance console for the Game Development Club with gamification, team management, QR code check-in, and analytics.

## 🚀 Innovative Features

### 🏆 Gamification System
- **Points System**: Earn 10 points for attendance, 5 bonus points for early birds (first 3 to arrive)
- **Streaks**: Track consecutive meeting attendance
- **Achievement Badges**: 
  - 🏆 Perfect Attendance - 5 consecutive meetings
  - 🔥 Streak Master - 10 meeting streak
  - 🎯 Half Century - 50% attendance rate
  - 🤝 Team Player - Consistent team meeting attendance
  - ⭐ Rising Star - Top attendee of the month

### 📊 Leaderboard
- Real-time ranking of members by points
- Display medals (🥇🥈🥉) for top 3
- Show current streaks and badge counts
- Filter by team

### 👥 Team Management
- Create and manage project teams
- Assign members to teams
- Color-coded team identification
- Team-based attendance filtering
- Team performance statistics

### 📱 QR Code Self Check-in
- Generate unique QR codes for each meeting
- Members can scan to self-mark attendance
- Refresh tokens for security
- Visual QR display in the hero section

### 📁 CSV Roster Import & Export
- **One-Click CSV Import**: Import entire student/member rosters (`Name, Email, Team`) directly from `.csv` files
- **Automatic Team Provisioning**: Teams found in imported CSV files are created automatically with unique color accents
- **CSV & JSON Export**: Export current member rosters with attendance rates and points to CSV, or download full database JSON backups

### ⚡ Performance & Battery Optimization
- **Canvas Throttling**: Background canvas animation automatically pauses when tab is inactive (`document.hidden`), drastically reducing CPU & GPU usage
- **Reduced Motion Support**: Honors `prefers-reduced-motion: reduce` OS accessibility settings with static render mode

### 📈 Attendance Analytics
- Bar chart showing attendance trends over last 10 meetings
- Attendance rate percentages
- Average, best, and worst attendance statistics
- Team-wise attendance comparison

## Quick Start

### 1. Install Dependencies
Before running the server for the first time, install the required packages:

```powershell
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` and configure your SMTP credentials if using auto-email. (Note: `.env` is ignored by Git to keep credentials secure):

```powershell
cp .env.example .env
```

### 3. Run the Server

Double-click `start-mail-server.bat`, or run:

```powershell
node server.js
```

Then open:

```text
http://localhost:3000
```

4. Fill **Auto Mail Engine** with the sender SMTP details and click **Save Sender** (or configure via `.env`).
5. Click **Test Sender**. When this passes, warning mails will send automatically.

The app can still be opened directly with `index.html`, but automatic email sending requires the local server.

## How to Use

### 1. Set Up Members & Teams
1. Go to **Member Vault**
2. Create teams first using the **+ Add Team** button
3. Add members and assign them to teams
4. Or click **Load 15 Placeholders** to get started quickly

### 2. Start a Meeting
1. Enter a meeting title and date in **Meeting Gate**
2. Click **Start Meeting**
3. A QR code will appear in the hero section for self check-in

### 3. Mark Attendance
- **Manual**: Use the **Presence Check** panel to search by email or name
- **QR Self Check-in**: Share the QR code with members
- **Live Roster**: Click "Mark" buttons directly on the roster

### 4. Close Meeting & Send Warnings
1. Click **Close Meeting & Send Warnings**
2. Warning emails are automatically sent to absent members
3. Check the **Mail Launch Deck** for delivery status

### 5. View Analytics & Leaderboard
- Check the **Leaderboard** panel for top performers
- View **Achievement Badges** earned by members
- See **Attendance Analytics** for trends and statistics

## Gamification Details

### Points Calculation
| Action | Points |
|--------|--------|
| Attend meeting | +10 |
| Early bird (first 3) | +5 bonus |
| Absence | Streak reset |

### Badge Thresholds
| Badge | Requirement |
|-------|-------------|
| Perfect Attendance | 5 consecutive meetings |
| Streak Master | 10 meeting streak |
| Half Century | 50% overall attendance |
| Team Player | 50+ points |
| Rising Star | 100+ points |

## Email Setup

For Gmail, enable 2-step verification and create an App Password. Use that App Password in the app; do not use your normal Gmail password.

Recommended Gmail settings:

```text
SMTP host: smtp.gmail.com
Port: 587
SSL 465: unchecked
```

If port `465` times out, keep the settings above. The server will use STARTTLS on port `587`.

The sender setup is saved in `.env` on this device. Keep that file private.

If SMTP is missing, offline, or blocked, the app keeps ready-to-send drafts through `mailto:` links so the meeting record is not lost.

## Data Storage

The app stores all data in the browser's local storage:
- Members and team assignments
- Active meeting state
- Meeting history (last 30 meetings)
- Gamification data (points, streaks, badges)
- Warning mail drafts

Use the **Export** button to backup your data as JSON.

## Architecture

- **Frontend**: Vanilla JavaScript, no dependencies
- **Backend**: Node.js HTTP server with SMTP client
- **Storage**: localStorage (browser) + SQLite (optional)
- **Styling**: Custom CSS with responsive design

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires localStorage support.

## License

Private - For Game Development Club use only.