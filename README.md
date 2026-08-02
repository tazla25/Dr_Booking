# Smart Queue & Booking Bot 🏥

> WhatsApp/Telegram-based appointment & live queue system for local clinics.
> Built as a **Micro-SaaS** — zero app downloads for patients or staff.

---

## 📁 Project Structure

```
smart-queue-bot/
├── dashboard/              ← Next.js web dashboard app
├── prisma/
│   ├── schema.prisma       ← Prisma ORM database schema (8 models)
│   └── seed.js             ← Database seed script
├── src/
│   ├── app.js              ← Express app with health + queue API routes
│   ├── bot/
│   │   ├── handler.js      ← Routes messages to patient/admin flows
│   │   ├── index.js        ← Telegram bot init & webhook registration
│   │   └── session.js      ← Bot session management
│   ├── database/
│   │   └── prisma.js       ← Prisma client initialization
│   ├── flows/
│   │   ├── admin.js        ← Compounder/admin conversation flow
│   │   └── patient.js      ← Patient booking conversation flow
│   ├── jobs/
│   │   └── reminderJob.js  ← Automated appointment reminder job
│   ├── services/
│   │   ├── adminService.js   ← Auth PIN, patient list, status updates
│   │   ├── bookingService.js ← Create bookings, generate queue numbers
│   │   └── doctorService.js  ← Search doctors by PIN code
│   └── utils/
│       ├── errors.js       ← Custom error definitions
│       ├── logger.js       ← Logging helper
│       ├── messages.js     ← All bot reply strings (Bengali, i18n-ready)
│       └── validators.js   ← Input validation helpers
├── public/
│   └── tracker.html        ← Live queue tracker (auto-refreshes every 15s)
├── tests/
│   ├── flows/
│   │   ├── admin.test.js
│   │   └── patient.test.js
│   └── services/
│       ├── adminService.test.js
│       ├── bookingService.test.js
│       └── doctorService.test.js
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

- Create a free project at [supabase.com](https://supabase.com)
- Go to **Settings** > **Database** > **Connection string (URI)** — copy the PostgreSQL connection string
- This will be your `DATABASE_URL`

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
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
TELEGRAM_BOT_TOKEN=your-bot-token
PORT=3000
PUBLIC_URL=https://your-app.onrender.com
DASHBOARD_URL=https://your-dashboard.vercel.app
BOT_API_SECRET=your-shared-secret-here
```

### 5. Push database schema

```bash
npx prisma db push
npx prisma generate
npm run db:seed
```

### 6. Run tests

```bash
npm test
```

### 7. Start locally

```bash
npm run dev
```

> Note: For local testing of the Telegram webhook, use [ngrok](https://ngrok.com):
> `ngrok http 3000` → copy the HTTPS URL → set as `PUBLIC_URL` in `.env`

---

## 🗄️ Database Tables

| Table / Model | Purpose |
|---|---|
| `Doctor` (`doctors`) | Doctor name, specialization, consultation fee, rating, and active status |
| `Schedule` (`schedules`) | Doctor schedules by PIN code, day of week, and clinic timings |
| `Appointment` (`appointments`) | Patient bookings with race-condition safe queue numbers |
| `AdminUser` (`admin_users`) | Admin and compounder user accounts and roles |
| `MagicLink` (`magic_links`) | Short-lived single-use magic link authentication tokens |
| `FailedLogin` (`failed_logins`) | Audit log for failed login attempts (brute-force protection) |
| `AuditLog` (`audit_logs`) | Audit logging for administrative and system actions |
| `BotSession` (`bot_sessions`) | Persistent state storage for Telegram bot session conversations |

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
5. Add all `.env` variables in Render's Environment tab, setting `DATABASE_URL`, `BOT_API_SECRET`, and `DASHBOARD_URL`
6. Set `PUBLIC_URL` to your Render app URL (e.g. `https://smart-queue-bot.onrender.com`)
7. Deploy!

---

## ☁️ Deploy Dashboard to Vercel

- The `dashboard/` directory is a separate Next.js app deployed to Vercel
- Set `DATABASE_URL`, `BOT_API_SECRET`, and `MAGIC_LINK_BASE_URL` env vars on Vercel
- Set the Root Directory to `dashboard` in Vercel project settings

---

## 🔮 Future Features

- WhatsApp Cloud API integration
- Digital PDF invoices via WhatsApp
- AI-predicted waiting time
- Payment integration (bKash, Nagad)
- Multi-clinic support
- Doctor rating system
