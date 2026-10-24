# SmartCampus — Autonomous AI-Powered Campus Maintenance

A next-generation editorial campus maintenance and facility intelligence platform powered by **Google Gemini 3.0 Flash**. Built with modern editorial warm-brutalism aesthetics, real-time natural language triage, multimodal photo diagnostics, and automated department dispatch.

---

## ✨ Features

- **Autonomous Facility NLP Triage**: Understands natural conversational complaint input, student slang, and extracts root technical issues in milliseconds.
- **Multimodal Photo Evidence & Diagnostics**: Scans uploaded photos of broken campus infrastructure (water leaks, sparks, crack propagation) to calculate urgency tiers and detect safety risks.
- **Automated Smart Routing**: Auto-allocates issues to responsible teams (Electrical, Plumbing, HVAC, IT, Security, Sanitation) with real-time SLA tracking.
- **Smart Duplicate Detection**: Compares new submissions against active campus tickets using text embeddings and location proximity to prevent duplicate dispatches.
- **Facility Operations Dashboard**: Real-time KPI metrics, triage filter pills (Critical, In Progress, Duplicate Flagged, Resolved), searchable ticket log, and status updates.
- **Community Feed & Upvoting**: Public campus feed where students can view reported campus issues, upvote critical fixes, and follow live repair progress.
- **Editorial Warm-Brutalist Design**: Dual-mode theme system (warm sand/cream canvas `#FAF7F2` and rich espresso `#150E09`), high-contrast typography, and floating pill navigation.
- **Global Floating Back Navigation**: Integrated left-side history back button that gracefully steps back to the home landing view.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, Modern CSS (Custom Design System, Glassmorphism, Dual Theme Tokens), Vanilla JavaScript (ESM)
- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (`better-sqlite3`)
- **AI Engine**: Google Gemini API (`@google/genai` / `gemini-2.0-flash` / `gemini-1.5-flash`)

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **npm**

### 2. Installation
```bash
git clone https://github.com/shivpugla/smart_campus.git
cd smart_campus
npm install
```

### 3. Configure Environment
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Add your Google Gemini API key:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
PORT=3000
```
*(Get a free API key at [Google AI Studio](https://aistudio.google.com/))*

### 4. Run the Application
```bash
npm run dev
# or
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Demo Accounts

The application includes 1-click test accounts directly on the Sign In page:
- **Student**: `student@campus.edu` / `student123`
- **Staff Supervisor (Admin)**: `admin@campus.edu` / `admin123`
- **Electrical Technician**: `sarah.c@campus.edu` / `staff123`

---

## 📄 License
ISC
