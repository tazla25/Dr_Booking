# Dr_Booking — WhatsApp Setup Guide

This guide walks you through everything you need to do manually to make the WhatsApp bot live. The codebase has been fully migrated from Telegram to WhatsApp — this guide covers the Meta platform side, which cannot be automated.

---

## Phase 1: WhatsApp Cloud API Setup (Manual Steps)

### Step 1: Create a Meta Business Account

1. Go to https://business.facebook.com/
2. Create a Business Account (if you don't have one)
3. Verify your business (optional for testing, required for production)

### Step 2: Create a Meta App

1. Go to https://developers.facebook.com/apps/
2. Click **Create App**
3. Select **Business** as the type
4. Name it "Dr_Booking Bot"
5. Add the **WhatsApp** product to your app

### Step 3: Get Your Credentials

In the Meta App dashboard, collect these values:

| Variable | Where to find it |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup → "Phone Number ID" |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp → API Setup → "Generate access token" (or create a permanent System User token in Business Settings) |
| `WHATSAPP_VERIFY_TOKEN` | A string **YOU** choose (e.g., `drb_verify_2026`). You'll enter this when configuring the webhook. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Business Settings → WhatsApp Manager |

### Step 4: Add a Test Phone Number

1. In WhatsApp → API Setup → "To" field
2. Add your own phone number (and any test users)
3. You can only send messages to test numbers until your business is verified

### Step 5: Configure the Webhook

1. Go to WhatsApp → Configuration → Webhook
2. Enter your webhook URL: `https://<your-render-app>.onrender.com/webhook`
3. Enter your Verify Token (the `WHATSAPP_VERIFY_TOKEN` you chose in Step 3)
4. Subscribe to: **messages**, **message_status**, **message_delivered**

### Step 6: Set Environment Variables

**On Render (bot backend):**

```env
DATABASE_URL=postgresql://postgres:HKX0901M6SWldIwO@db.fepuihmkijvwmjpiqzfz.supabase.co:5432/postgres
WHATSAPP_PHONE_NUMBER_ID=<from Step 3>
WHATSAPP_ACCESS_TOKEN=<from Step 3>
WHATSAPP_VERIFY_TOKEN=<from Step 3>
WHATSAPP_BUSINESS_ACCOUNT_ID=<from Step 3>
BOT_API_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
DASHBOARD_URL=<your Vercel URL>
PUBLIC_URL=<your Render URL>
PLATFORM=whatsapp
PORT=3000
```

**On Vercel (dashboard):**

```env
DATABASE_URL=postgresql://postgres:HKX0901M6SWldIwO@db.fepuihmkijvwmjpiqzfz.supabase.co:5432/postgres
BOT_API_SECRET=<same value as Render>
NEXT_PUBLIC_DEV_BOT_SECRET=<generate a different secret>
NEXT_PUBLIC_PLATFORM=whatsapp
NEXT_PUBLIC_BOT_URL=https://wa.me/91XXXXXXXXXX
NEXT_PUBLIC_DASHBOARD_URL=<your Vercel URL>
```

### Step 7: Test the Bot

1. Send a WhatsApp message to your WhatsApp Business number (the one shown in Meta App dashboard)
2. You should receive a welcome message from the bot
3. Try `/book`, `/register`, `/admin` commands

### Step 8: Verify Your Business (for production)

1. Go to Meta Business Manager → Business Settings
2. Submit business verification documents
3. Once verified, you can message any phone number (not just test numbers)
4. Message costs apply: ~₹0.35 per conversation (24-hour window)

---

## Phase 2: Test Accounts

The database has been seeded with these test accounts. **Add these phone numbers as test recipients in Meta WhatsApp Manager** before trying to log in:

| Role | Name | WhatsApp Number |
|------|------|-----------------|
| SUPER_ADMIN | Founder | `+910000000001` |
| DOCTOR (VERIFIED) | Dr. Arjun Sen | `+919876543210` |
| DOCTOR (VERIFIED) | Dr. Meera Chowdhury | `+919876543211` |
| DOCTOR (VERIFIED) | Dr. Rahul Pramanik | `+919876543212` |
| DOCTOR (PENDING) | Dr. Pending Applicant | `+919876543299` |
| COMPOUNDER | Ramesh (for Dr. Arjun Sen) | `+919876543220` |

To log in to the dashboard:
1. Open the dashboard URL (Vercel deployment)
2. In the Dev Panel (visible in non-production), click any demo user button — this simulates the WhatsApp bot generating a magic link
3. Or: send `/admin` from the WhatsApp number above to the bot, then click the magic link the bot sends back

---

## Phase 3: Environment Variables — Complete Reference

### Bot (Render) — Required

```env
DATABASE_URL=postgresql://postgres:HKX0901M6SWldIwO@db.fepuihmkijvwmjpiqzfz.supabase.co:5432/postgres
WHATSAPP_PHONE_NUMBER_ID=<from Meta>
WHATSAPP_ACCESS_TOKEN=<from Meta>
WHATSAPP_VERIFY_TOKEN=<your chosen string>
WHATSAPP_BUSINESS_ACCOUNT_ID=<from Meta>
BOT_API_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
DASHBOARD_URL=https://<your-app>.vercel.app
PUBLIC_URL=https://<your-app>.onrender.com
PLATFORM=whatsapp
PORT=3000
```

### Dashboard (Vercel) — Required

```env
DATABASE_URL=postgresql://postgres:HKX0901M6SWldIwO@db.fepuihmkijvwmjpiqzfz.supabase.co:5432/postgres
BOT_API_SECRET=<same value as Render>
NEXT_PUBLIC_DEV_BOT_SECRET=<generate a different secret>
NEXT_PUBLIC_PLATFORM=whatsapp
NEXT_PUBLIC_BOT_URL=https://wa.me/91XXXXXXXXXX
```

### Optional

```env
MAGIC_LINK_BASE_URL=https://<your-app>.vercel.app
SUPER_ADMIN_PHONE=+91XXXXXXXXXX
ERROR_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## Phase 4: Known Limitations

1. **WhatsApp buttons are limited to 3 per message** (vs Telegram's 8 per row).
   Flows with >3 options automatically use WhatsApp "list" messages instead.

2. **WhatsApp doesn't support Markdown links `[text](url)`**.
   URLs are sent as plain text.

3. **WhatsApp 24-hour rule**: After a patient messages, you have 24 hours to reply freely.
   After that, only pre-approved template messages work.

4. **WhatsApp template messages**: For business-initiated messages (reminders),
   you need to create and approve templates in Meta Business Manager.
   The reminder job currently sends free-form messages — for production, switch to approved templates.

5. **Business verification is required for production** (messaging any number).
   Until verified, you can only message test numbers.

6. **Message costs**: ~₹0.35 per conversation (24-hour window).
   Budget ~₹500/month for 1000 active patients.

---

## Migration Notes

This migration:

- **Removed** the `node-telegram-bot-api` dependency from `package.json`
- **Deleted** `src/platforms/telegram.js` and `src/platforms/multi.js`
- **Removed** `TELEGRAM_BOT_TOKEN` env var
- **Removed** `WEBHOOK_SECRET` env var (derived from Telegram token — no longer needed)
- **Kept** `telegramChatId` column in the database for backward compatibility with legacy accounts
- **Made** `whatsappNumber` the primary identifier for bot auth and magic link generation
- **Updated** the dev panel demo users to use WhatsApp numbers (`+91XXXXXXXXXX`)
- **Migrated** the seed data to use E.164 phone numbers for all users

The `/link <phone>` command for compounders now links the WhatsApp number instead of the Telegram chat ID. Existing compounders will need to re-link after migration (their `telegramChatId` is preserved but no longer used by the bot).

---

## Troubleshooting

### "WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN."

→ You forgot to set the env vars on Render. Re-check Phase 1, Step 6.

### "Webhook verification failed"

→ The `WHATSAPP_VERIFY_TOKEN` in your Render env vars doesn't match what you entered in Meta's webhook config. Make sure they're identical (case-sensitive).

### "Magic link generation failed"

→ Either `BOT_API_SECRET` doesn't match between Render and Vercel, or `DASHBOARD_URL` on Render points to the wrong Vercel deployment.

### Dashboard dev panel shows "Dev Panel is disabled"

→ You're using the default `dev-bot-secret-change-in-production` for `NEXT_PUBLIC_DEV_BOT_SECRET`. Generate a real secret and set it on Vercel.

### Patient can't reach the bot

→ The patient's phone number must be added as a test recipient in Meta WhatsApp Manager (until business verification is complete).

---

*"শুধু WhatsApp — কোনো Telegram নয়। সব কাজ এক জায়গায়।"*
