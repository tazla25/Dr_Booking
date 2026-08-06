# Smart Queue & Booking Bot 🏥

> WhatsApp Cloud API-based appointment & live queue system for local Indian clinics.
> Built as a **Micro-SaaS** — zero app downloads for patients or staff.
> Patients book via WhatsApp; doctors/compounders manage the queue through a web dashboard.

> **Platform status (v11):** Telegram support has been removed. The bot now
> talks to the WhatsApp Cloud API exclusively. Authentication is phone +
> password (the legacy magic-link flow is deprecated). The dashboard is a
> separate Next.js app deployed to Vercel; the bot is a Node/Express app
> deployed to Render. Both share a single Supabase Postgres database.

---

## 📁 Project Structure

```
Dr_Booking/
├── dashboard/              ← Next.js web dashboard app (deploy to Vercel)
├── prisma/
│   ├── schema.prisma       ← Prisma ORM database schema (bot side)
│   ├── seed.js             ← Database seed script
│   └── seed-superadmin.js  ← Seed the first SUPER_ADMIN account
├── src/
│   ├── app.js              ← Express app: health, queue API, /api/notify
│   ├── bot/
│   │   ├── handler.js      ← Routes WhatsApp messages to patient/admin flows
│   │   ├── index.js        ← WhatsApp bot init & webhook registration
│   │   └── session.js      ← Persistent bot session management
│   ├── database/
│   │   └── prisma.js       ← Prisma client initialization
│   ├── flows/
│   │   ├── admin.js        ← Doctor/compounder conversation flow (login, register, forgot, invite)
│   │   └── patient.js      ← Patient booking conversation flow
│   ├── jobs/
│   │   ├── reminderJob.js  ← 1-hour appointment reminder cron (template fallback)
│   │   └── feedbackJob.js  ← Post-visit feedback request cron
│   ├── platforms/
│   │   ├── whatsapp.js     ← WhatsApp Cloud API adapter (text, button, list, template)
│   │   └── index.js        ← Platform base class
│   ├── services/
│   │   ├── adminService.js   ← Phone+password auth, registration, doctor approval
│   │   ├── bookingService.js ← Create bookings, queue numbers, reschedule, history
│   │   ├── doctorService.js  ← Search doctors by PIN / name / specialty / city
│   │   ├── scheduleService.js← Schedule overrides (close / modify hours per date)
│   │   └── feedbackService.js← Patient feedback (1–5 stars + comment)
│   └── utils/
│       ├── errors.js       ← Custom error definitions
│       ├── logger.js       ← Pino logger
│       ├── messages.js     ← All bot reply strings (bn / en / hi)
│       ├── bengali.js      ← Bengali numerals + trust-signal helpers
│       └── validators.js   ← Input validation (phone, PIN, name, address, password)
├── public/
│   └── tracker.html        ← Live queue tracker (auto-refreshes every 15s)
├── tests/                  ← Jest unit tests (services + flows)
├── .env.example            ← Copy to .env and fill in real values
├── index.js                ← Root entry point (Express + bot + cron jobs)
├── WHATSAPP_TEMPLATES.md   ← Pre-approved template message reference
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

### 3. Configure WhatsApp Cloud API

1. Go to [Meta for Developers](https://developers.facebook.com) → create an app → add WhatsApp product
2. Copy the **Phone Number ID**, **Access Token**, and **Webhook Verify Token**
3. Add a test recipient phone number (or move your number out of the sandbox for production)
4. Configure the webhook URL to point to your Render app's `/webhook` endpoint and subscribe to `messages`, `message_status`, `message_delivered`
5. (Optional but recommended) Submit pre-approved template messages — see `WHATSAPP_TEMPLATES.md`

### 4. Configure environment variables

```bash
cp .env.example .env
# Now edit .env with your real values
```

`.env` (bot side — Render):
```
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_BUSINESS_ACCOUNT_ID=your-waba-id
PORT=3000
PUBLIC_URL=https://your-bot.onrender.com
DASHBOARD_URL=https://your-dashboard.vercel.app
BOT_API_SECRET=your-shared-secret-here
```

`dashboard/.env.local` (dashboard side — Vercel):
```
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
BOT_API_SECRET=your-shared-secret-here
BOT_API_URL=https://your-bot.onrender.com
DASHBOARD_URL=https://your-dashboard.vercel.app
NEXT_PUBLIC_DEV_BOT_SECRET=your-frontend-side-public-secret
```

### 5. Push database schema

```bash
npx prisma db push
npx prisma generate
npm run db:seed
npm run db:seed-superadmin   # creates the first SUPER_ADMIN account
```

### 6. Run tests

```bash
npm test
```

### 7. Start locally

```bash
npm run dev
```

> Note: For local testing of the WhatsApp webhook, use [ngrok](https://ngrok.com):
> `ngrok http 3000` → copy the HTTPS URL → set as `PUBLIC_URL` in `.env` and configure it as the webhook URL in Meta Business Manager.

---

## 🗄️ Database Tables

| Table / Model | Purpose |
|---|---|
| `Doctor` (`doctors`) | Doctor profile (owned by an AdminUser), specialization, fee, rating, trust signals |
| `Schedule` (`schedules`) | Doctor schedules by PIN code, day of week, and clinic timings |
| `ScheduleOverride` (`schedule_overrides`) | Per-date overrides: closed, modified hours, or special |
| `Appointment` (`appointments`) | Patient bookings with race-condition safe queue numbers and a `source` field (`ONLINE` / `WALK_IN`) |
| `Feedback` (`feedback`) | Post-visit patient feedback (1–5 stars + comment) |
| `AdminUser` (`admin_users`) | Doctor / Compounder / Super Admin accounts with verification flow |
| `Session` (`sessions`) | Cookie-based dashboard sessions (HMAC-token, 30-min sliding window) |
| `MagicLink` (`magic_links`) | Legacy single-use magic link tokens (deprecated in v11, kept for back-compat) |
| `FailedLogin` (`failed_logins`) | Audit log for failed login attempts (brute-force protection) |
| `AuditLog` (`audit_logs`) | Audit logging for administrative and system actions |
| `BotSession` (`bot_sessions`) | Persistent state storage for WhatsApp bot conversation flows |
| `PatientNote` (`patient_notes`) | Internal notes that doctors/compounders pin to patient phone numbers |
| `RateLimitEntry` (`rate_limits`) | Per-IP rate limiting for Express API endpoints |

---

## 💬 Bot Commands

| Command | Who | Action |
|---|---|---|
| `/start` or `/book` | Patient | Start booking flow (search by PIN / name / specialty+city / specialty+PIN) |
| `/queue` | Patient | Get live tracker link |
| `/cancel` | Patient | Cancel an upcoming appointment |
| `/admin` or `/login` | Doctor / Compounder | Start phone + password login |
| `/register` | Doctor | Register a new doctor account (pending verification) |
| `/forgot` | Doctor / Compounder | Reset password via OTP |
| `/invite` | Doctor | Invite a compounder to your profile |
| `/link <phone>` | Compounder | Link your WhatsApp to the doctor who invited you |

---

## 🌐 API Endpoints (Express backend)

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /api/queue/:scheduleId/:date` | Live queue status (JSON) |
| `POST /api/notify` | Bot-internal endpoint to send WhatsApp messages (called by dashboard; requires `BOT_API_SECRET`) |
| `POST /webhook` | WhatsApp webhook receiver (GET verifies, POST receives messages) |
| `GET /tracker.html` | Live queue tracker page |

---

## ☁️ Deploy the Bot to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Settings:
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `node index.js`
5. Add all `.env` variables in Render's Environment tab, setting `DATABASE_URL`, `BOT_API_SECRET`, `DASHBOARD_URL`, `WHATSAPP_*`, and `PUBLIC_URL`
6. Set `PUBLIC_URL` to your Render app URL (e.g. `https://dr-booking-bot.onrender.com`)
7. Deploy!
8. After deploy: in Meta Business Manager, set the webhook URL to `${PUBLIC_URL}/webhook` and subscribe to `messages`, `message_status`, `message_delivered`

---

## ☁️ Deploy the Dashboard to Vercel

- The `dashboard/` directory is a separate Next.js app deployed to Vercel
- Set `DATABASE_URL`, `BOT_API_SECRET`, `BOT_API_URL`, `DASHBOARD_URL`, and `NEXT_PUBLIC_DEV_BOT_SECRET` env vars on Vercel
- Set the Root Directory to `dashboard` in Vercel project settings
- After deploy: set the dashboard URL in the bot's `DASHBOARD_URL` env var (the bot uses it to build magic-link / session-login URLs)

---

## 🔮 Roadmap (Future Features)

- Digital PDF invoices via WhatsApp (currently receipts are text-based)
- AI-predicted waiting time (currently a naive average using `avgMinutesPerPatient`)
- Payment integration (bKash, Nagad, UPI)
- Multi-clinic support with a dedicated Clinic model (currently via the `clinicName` string on Schedule)
- Email notifications (currently WhatsApp-only)
- WebSocket / SSE for real-time dashboard updates (currently 30s polling on the notification bell)
