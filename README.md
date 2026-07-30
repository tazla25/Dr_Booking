# Smart Queue & Booking Bot 🏥

> WhatsApp/Telegram-based appointment & live queue system for local clinics.
> Built as a **Micro-SaaS** — zero app downloads for patients or staff.

---

## 📁 Project Structure

```
smart-queue-bot/
├── src/
│   ├── bot/
│   │   ├── index.js        ← Telegram bot init & webhook registration
│   │   ├── handler.js      ← Routes messages to patient/admin flows
│   │   └── session.js      ← In-memory session state machine
│   ├── flows/
│   │   ├── patient.js      ← Patient booking conversation flow
│   │   └── admin.js        ← Compounder/admin conversation flow
│   ├── services/
│   │   ├── doctorService.js  ← Search doctors by PIN code
│   │   ├── bookingService.js ← Create bookings, generate queue numbers
│   │   └── adminService.js   ← Auth PIN, patient list, status updates
│   ├── database/
│   │   └── supabase.js     ← Single Supabase client export
│   ├── utils/
│   │   └── messages.js     ← All bot reply strings (Bengali, i18n-ready)
│   └── app.js              ← Express app with health + queue API routes
├── public/
│   └── tracker.html        ← Live queue tracker (auto-refreshes every 15s)
├── tests/
│   ├── services/
│   │   ├── doctorService.test.js
│   │   ├── bookingService.test.js
│   │   └── adminService.test.js
│   └── flows/
│       ├── patient.test.js
│       └── admin.test.js
├── schema.sql              ← Run this in Supabase SQL Editor to create tables
├── .env.example            ← Copy to .env and fill in real values
├── index.js                ← Root entry point
└── package.json
```

---

## 🚀 Setup (for local development)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and run the entire `schema.sql` file
3. After creating the `doctors` table, insert a doctor and copy its UUID
4. Complete the seed inserts in `schema.sql` with the real UUID

### 3. Get a Telegram bot token

1. Open Telegram → search for `@BotFather`
2. Send `/newbot` → follow instructions
3. Copy the token

### 4. Configure environment variables

```bash
cp .env.example .env
# Now edit .env with your real values
```

`.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
TELEGRAM_BOT_TOKEN=your-bot-token
PORT=3000
PUBLIC_URL=https://your-app.onrender.com
```

### 5. Run tests

```bash
npm test
```

### 6. Start locally

```bash
npm run dev
```

> Note: For local testing of the Telegram webhook, use [ngrok](https://ngrok.com):
> `ngrok http 3000` → copy the HTTPS URL → set as `PUBLIC_URL` in `.env`

---

## 🗄️ Database Tables

| Table | Purpose |
|---|---|
| `doctors` | Doctor name and specialization |
| `schedules` | Doctor schedules by PIN code and day |
| `appointments` | Patient bookings with queue numbers |
| `admin_access` | Compounder PIN codes per doctor |

---

## 💬 Bot Commands

| Command | Who | Action |
|---|---|---|
| `/start` or `/book` | Patient | Start booking flow |
| `/queue` | Patient | Get live tracker link |
| `/admin` | Compounder | Start admin login |
| `/next` | Compounder (in dashboard) | Mark next patient as done |
| `/cancel <token>` | Compounder (in dashboard) | Cancel a patient |

---

## 🌐 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /api/queue/:scheduleId/:date` | Live queue status (JSON) |
| `POST /webhook` | Telegram webhook receiver |
| `GET /tracker.html` | Live queue tracker page |

---

## ☁️ Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
5. Add all `.env` variables in Render's Environment tab
6. Set `PUBLIC_URL` to your Render app URL (e.g. `https://smart-queue-bot.onrender.com`)
7. Deploy!

---

## 🔮 Future Features (Phase 2+)

- WhatsApp Cloud API (replace Telegram)
- Automated appointment reminders
- Walk-in patient manual entry by compounder
- Digital PDF invoices via WhatsApp
- AI-predicted waiting time
- Analytics dashboard
- Multi-language support
