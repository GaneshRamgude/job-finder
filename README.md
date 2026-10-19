# ⚡ EduJobFinder • Educational Qualification Career & Vacancy Matcher

An AI-powered job matching engine and web application that takes an individual's educational qualification, recommends the best-suited career roles they can perform with salary estimates and required skills, and aggregates live vacancies from **Majhi Naukri** (`https://majhinaukri.in/new-updates/`), **Naukri.com**, and open web recruitment portals with **instant real-time vacancy notifications**.

---

## 🌟 Key Features

1. **Qualification-Based Role Intelligence**:
   - Maps qualifications: **10th Pass (SSC)**, **12th Pass (HSC)**, **ITI (All Trades)**, **Diploma (Polytechnic)**, **BE / B.Tech (Engineering)**, **Any Graduate (BA/B.Sc/B.Com/BCA)**, and **Post Graduate (MBA/MCA/M.Tech/M.Sc)**.
   - Computes:
     - **Top Recommended Roles** (e.g. Railway ALP, SDE 1, SSC Junior Engineer, Bank PO, PSU Trainee).
     - **Match Score Gauge** (e.g. 98% Match).
     - **Average Salary / Pay Scale** (Level 1-10 7th CPC or Corporate CTC).
     - **Required Core Skills & National Competitive Exams** (GATE, UPSC, SSC, RRB, IBPS, UGC NET).

2. **Live Job Vacancies & Aggregation (Focusing on the 2 Provided Sites)**:
   - **Majhi Naukri (`majhinaukri.in/new-updates/`)**: Real-time parser and RSS crawler for Maharashtra and Central Government recruitments (ISRO, EIL, MECON, Railways, Police, Banking, Defense, PSUs).
   - **Naukri.com (`naukri.com`)**: Leading corporate openings (TCS, Infosys, Accenture, Wipro, L&T, HDFC Bank, ICICI Bank) with direct application links and dynamic keyword-targeted deep search links.
   - **Multi-Source Filtering**: Filter by "All Vacancies", "Majhi Naukri (Govt/PSU)", "Naukri.com (Corporate)", "80%+ Match", or "★ Saved Jobs".

3. **Instant Real-Time Notifications**:
   - **Server-Sent Events (SSE)**: Live streaming connection (`/api/stream-alerts`) from backend watcher to frontend.
   - **Background Poller**: Scans `majhinaukri.in` and alerts the moment a new recruitment notice drops.
   - **Web Browser Native Notifications**: Desktop popup when a vacancy matches the user's qualifications.
   - **Web Audio API Chime**: Crystal synthetic two-tone chime when a new vacancy alert arrives.
   - **Notification Center Drawer**: Unread badge counter and slide-out alerts log.
   - **⚡ Test Live Alert**: Test instant audio and popup notification delivery on demand.

4. **Dark & Attractive Theme**:
   - Modern obsidian/dark slate glassmorphism palette (`#080C15`, `#12192B`, `#06b6d4`, `#8b5cf6`, `#10b981`).
   - Neon glow borders, hover cards, interactive modals, responsive layout.

---

## 🚀 Running the Web Application

The application is already running at:
👉 **`http://localhost:3000`**

To launch manually in terminal or double-click:
```bash
cd C:\Users\ASUS\.gemini\antigravity\scratch\edu-job-finder
start.bat
# or
agy-node server.js
```

---

## 📁 Project Architecture

```
edu-job-finder/
├── server.js                      # High-performance HTTP server, SSE stream & API router
├── start.bat                      # One-click Windows launcher
├── services/
│   ├── majhiCrawler.js           # Live RSS scraper & parser for majhinaukri.in
│   ├── naukriService.js          # Corporate jobs engine & Naukri.com deep links
│   ├── roleRecommender.js        # Educational qualification to career roles matcher
│   └── notificationManager.js    # Real-time SSE alert dispatcher & history ring buffer
└── public/
    ├── index.html                # Responsive dark-theme dashboard
    ├── css/
    │   └── styles.css            # Dark cyberpunk glassmorphism CSS
    └── js/
        └── app.js                # Frontend app, Web Audio synthesizer & SSE client
```
