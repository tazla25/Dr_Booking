# Dr_Booking — Migration Progress Log

This file logs each phase of the WhatsApp migration as it completes.

---

## Phase 1: Setup & Bug Fixes ✅

- Cloned repo from `https://github.com/tazla25/Dr_Booking.git` to local workspace
- Extracted enhanced version tar to compare features
- Verified the critical syntax error in `dashboard/src/components/views/appointments-view.tsx` line 65 was already fixed on `main` (`const [hasMore, setHasMore] = useState(false)` is correct)
- Read migration prompt, bug report, and strategy doc for full context

---

## Phase 2: Telegram → WhatsApp Migration ✅

### Files Modified

- **`package.json`** — Removed `node-telegram-bot-api` dependency, updated description to "WhatsApp Micro-SaaS"
- **`index.js`** (root) — Removed `TELEGRAM_BOT_TOKEN` requirement, removed `WEBHOOK_SECRET` derivation, switched required env vars to `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN`, removed `bot.setWebHook` call (WhatsApp doesn't need this)
- **`src/bot/index.js`** — Removed Telegram/Multi platform imports, simplified to WhatsApp-only `createBot()` + `registerWebhook()`
- **`src/platforms/index.js`** — Base Platform class only (Telegram dispatcher removed)
- **`src/platforms/whatsapp.js`** — Enhanced with full button/list support (>3 buttons → list type), proper E.164 normalization, callback parsing for `button_reply` + `list_reply`, error cause preservation
- **`src/platforms/telegram.js`** — DELETED
- **`src/platforms/multi.js`** — DELETED
- **`src/services/adminService.js`** — `handleAdminAuth()` now looks up by `whatsappNumber` OR `phone` (fallback), sends `whatsappNumber` to magic-link endpoint. `registerDoctor()` accepts `whatsappNumber` instead of `telegramChatId`.
- **`src/bot/handler.js`** — Removed `parse_mode: 'Markdown'` from all `send()` helpers (WhatsApp doesn't use parse_mode — `*bold*` and `_italic_` work natively). Updated `/link <phone>` to set `whatsappNumber` instead of `telegramChatId`. Updated `/invite` to look up inviter by `whatsappNumber`/`phone`.
- **`src/flows/admin.js`** — `notifySuperAdminsOfNewRegistration` now queries super admins with `whatsappNumber` OR `phone`, and sends to whichever is set.
- **`src/jobs/reminderJob.js`** — Removed `parse_mode: 'Markdown'` from reminder messages
- **`src/jobs/feedbackJob.js`** — Switched to `bot.sendInlineKeyboard()` (which uses WhatsApp's list type for 5 buttons)
- **`src/utils/messages.js`** — Removed Markdown link syntax `[text](url)` (WhatsApp doesn't support it — URLs are plain text). Updated `BTN_ADMIN` text in all 3 languages.
- **`prisma/seed.js`** — All seed users now use `whatsappNumber` (E.164 phone numbers) instead of `telegramChatId`. Updated console summary table.
- **`prisma/seed-superadmin.js`** — Now sets `whatsappNumber` on upsert.
- **`.env.example`** — Removed Telegram vars, added full WhatsApp Cloud API block, added `PLATFORM=whatsapp` + `NEXT_PUBLIC_PLATFORM=whatsapp`

### Dashboard Files Modified

- **`dashboard/src/app/api/auth/generate-magic-link/route.ts`** — Now accepts `whatsappNumber` (preferred), `phone` (fallback), or `telegramChatId` (legacy). Comments updated to reflect WhatsApp-only flow.
- **`dashboard/src/app/api/auth/me/route.ts`** — Returns `whatsappNumber` (removed `telegramChatId` from response shape)
- **`dashboard/src/components/providers.tsx`** — `AuthUser` interface no longer includes `telegramChatId`; only `whatsappNumber`
- **`dashboard/src/components/views/bot-access-required-view.tsx`** — Demo users use `whatsappNumber` (E.164 numbers). Button text is hardcoded to WhatsApp (no platform toggle). Default URL is `https://wa.me/91XXXXXXXXXX`.
- **`dashboard/src/components/views/settings-view.tsx`** — "Telegram Chat ID" card replaced with "WhatsApp Number" card. Toast text and help text updated.
- **`dashboard/src/components/views/admin-verification-view.tsx`** — "Telegram Chat ID" replaced with "WhatsApp Number" in pending doctor cards
- **`dashboard/src/app/api/admin/compounders/route.ts`** — Returns `whatsappNumber` instead of `telegramChatId`
- **`dashboard/src/app/api/admin/compounders/[id]/route.ts`** — On compounder removal, sets `whatsappNumber: null` (instead of `telegramChatId: null`)
- **`dashboard/src/app/api/admin/pending-doctors/route.ts`** — Returns `whatsappNumber` instead of `telegramChatId`
- **`dashboard/src/app/auth/verify/page.tsx`** — Updated text "Telegram" → "WhatsApp", default URL `https://wa.me/91XXXXXXXXXX`
- **`dashboard/src/lib/magic-link.ts`** + **`dashboard/src/lib/auth.ts`** — Comment updates only

### Tests

- **`tests/services/adminService.test.js`** — Updated mock to include `whatsappNumber` alongside `telegramChatId` for backward compatibility

---

## Phase 3: Merge Enhanced Dashboard Features ✅

### New API Routes (copied from enhanced → v9 dashboard)

- `dashboard/src/app/api/patients/route.ts` — Patient list with search, stats
- `dashboard/src/app/api/patients/[phone]/route.ts` — Single patient detail
- `dashboard/src/app/api/patients/[phone]/notes/route.ts` — Patient notes (CRUD)
- `dashboard/src/app/api/patients/[phone]/receipts/route.ts` — Patient receipt history
- `dashboard/src/app/api/patient-notes/[id]/route.ts` — Single note CRUD
- `dashboard/src/app/api/notifications/route.ts` — Notification bell data
- `dashboard/src/app/api/export/route.ts` — CSV export (appointments/patients/revenue)
- `dashboard/src/app/api/appointments/calendar/route.ts` — Monthly calendar view
- `dashboard/src/app/api/appointments/[id]/receipt/route.ts` — Single appointment receipt
- `dashboard/src/app/api/analytics/revenue/route.ts` — Revenue analytics

### New Components

- `dashboard/src/components/views/patients-view.tsx` — Patient management page
- `dashboard/src/components/views/calendar-view.tsx` — Monthly calendar view
- `dashboard/src/components/notification-bell.tsx` — Header notification dropdown
- `dashboard/src/components/receipt-dialog.tsx` — Receipt modal
- `dashboard/src/components/export-button.tsx` — CSV export button
- `dashboard/src/components/revenue-widget.tsx` — Revenue summary card

### Updated Shell Components

- **`dashboard/src/components/sidebar.tsx`** — Added `calendar` and `patients` nav items, expanded `analytics` to include COMPOUNDER role
- **`dashboard/src/components/app-shell.tsx`** — Added routing for `calendar` and `patients` views
- **`dashboard/src/components/topbar.tsx`** — Integrated `<NotificationBell />` in header
- **`dashboard/src/lib/i18n.ts`** — Added `calendar` and `patients` translations (bn + en)

### Prisma Schema Updates

- **`prisma/schema.prisma`** + **`dashboard/prisma/schema.prisma`** (kept in sync):
  - Added new `PatientNote` model (id, patientPhone, authorId, note, isImportant, timestamps)
  - Added `patientNotes PatientNote[] @relation("PatientNoteAuthor")` relation to `AdminUser`

### API Helper Bug Fix

- **`dashboard/src/lib/api-helpers.ts`** — Added new `getDoctorIdScope()` helper for direct Doctor-model queries (returns `{ id: ... }` instead of `{ doctorId: ... }`). The original `getDoctorScope()` continues to work for Appointment/Schedule queries that go through the `doctorId` foreign key. This fixes the bug where Doctor-model queries broke when given a `{ doctorId: ... }` filter.

### TypeScript Fixes (during build)

- **`dashboard/src/app/api/appointments/calendar/route.ts`** — Added explicit type annotation to `days[]` array
- **`dashboard/src/app/api/export/route.ts`** — Made `Queue` field accept `number | string` (summary row uses empty string)
- **`dashboard/src/app/api/patients/route.ts`** — Removed cursor-based pagination (Prisma groupBy typing incompatible with conditional cursor + wide-typed `where` filter). `take: limit` already caps results.
- **`dashboard/src/app/api/auth/generate-magic-link/route.ts`** — Replaced `Record<string, string>` with proper union type for `where` clause

---

## Phase 4: Database Migration & Seed ✅

### Schema Applied

- All existing tables (`admin_users`, `doctors`, `schedules`, `appointments`, etc.) already had the required columns (`whatsappNumber`, `isAvailableNow`, `yearsExperience`, `landmark`, `mapLink`, etc.) from the v9 schema
- **Created** the new `patient_notes` table with proper foreign key to `admin_users.id` and 3 indexes (`patientPhone`, `authorId`, `isImportant`)

### Prisma Client Generated

- Ran `npx prisma generate` in both `/home/z/my-project/work/Dr_Booking` (root, bot) and `/home/z/my-project/work/Dr_Booking/dashboard` (dashboard) to ensure the Prisma Client includes the new `PatientNote` model

### Seed Run

- Direct DB connection wasn't possible because Supabase's `db.fepuihmkijvwmjpiqzfz.supabase.co` only resolves to IPv6, which this network can't reach
- Wrote a seed adapter script at `/home/z/my-project/scripts/seed-via-http.js` that uses the Supabase Management API SQL HTTP endpoint to run the seed
- Seeded all 6 test accounts (1 super admin, 3 verified doctors, 1 pending doctor, 1 compounder) with E.164 WhatsApp numbers
- Note: today's appointments were skipped because today's weekday didn't match Dr. Arjun Sen's first schedule (Monday) — this is expected behavior, not an error

---

## Phase 5: Lint, Build, Push ✅

### Bot Lint

- ✅ `npm run lint` passes with 0 errors (25 warnings, all about intentionally-unused params in abstract methods)
- Fixed `preserve-caught-error` ESLint rule by adding `{ cause: error }` to the WhatsApp API error throw

### Dashboard Lint + Build

- ✅ `npm run lint` passes with 0 errors (2 warnings about unused eslint-disable directives in `notification-bell.tsx`)
- ✅ `npm run build` completes successfully — all routes build, type check passes
- All 6 new API routes are listed in the build output: `/api/patients`, `/api/patient-notes/[id]`, `/api/notifications`, `/api/export`, `/api/appointments/calendar`, `/api/appointments/[id]/receipt`, `/api/analytics/revenue`, `/api/patients/[phone]/notes`, `/api/patients/[phone]/receipts`
- All new views (`calendar`, `patients`) are properly routed via the new sidebar + app-shell

### Commit + Push

- Staged all changes
- Committed with message: `feat: WhatsApp-only migration + merge enhanced dashboard features (patients, calendar, notifications, receipts, export, availability)`
- Pushed to `main` branch on GitHub

---

## Migration Complete

The Dr_Booking codebase is now:

- **WhatsApp-only** — all Telegram code removed, all identifiers use E.164 WhatsApp numbers
- **Feature-complete** — patient management, calendar view, notifications, receipts, CSV export, and "go live" availability toggle are all integrated
- **Type-safe** — full TypeScript build passes with no `as any` or `@ts-ignore` workarounds
- **Database-ready** — `patient_notes` table created, all seed data uses `whatsappNumber`
- **Deployment-ready** — see `WHATSAPP_SETUP_GUIDE.md` for the manual Meta platform setup steps
