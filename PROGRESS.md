# Dr_Booking — Reform Progress

> Living log of the autonomous agent's progress through the 18-task reform plan.

---

## Task 1.1 — Flip account ownership from compounder to doctor

- **Status:** ✅ Complete (local implementation)
- **Commit:** (pending — cannot push without GitHub PAT)
- **Deploy:** Not yet (waiting on GitHub PAT for push, DATABASE_URL for migration)
- **Date:** 2026-08-03
- **Notes:**

  ### Schema changes (prisma/schema.prisma + dashboard/prisma/schema.prisma — kept in sync)
  - Added `Role` enum: `DOCTOR | COMPOUNDER | SUPER_ADMIN`
  - Added `VerificationStatus` enum: `PENDING | VERIFIED | REJECTED | SUSPENDED`
  - Updated `AdminUser` model:
    - Removed old `doctorId` field (compounder→doctor link via Doctor.adminUsers)
    - Added `role Role` (default COMPOUNDER)
    - Added `verificationStatus VerificationStatus` (default PENDING)
    - Added doctor-specific fields: `medicalRegNumber` (unique), `specialization`, `verificationDocs Json?`, `verifiedAt`, `verifiedBy`
    - Added `delegatedDoctorId` (compounder scope) with `delegatedDoctor` relation
    - Added invitation metadata: `invitedBy`, `invitedAt`
    - Added `phone String? @unique` (new primary identifier)
    - Added `ownedDoctor Doctor?` back-relation
    - Added indexes on `role`, `verificationStatus`, `delegatedDoctorId`
  - Updated `Doctor` model:
    - Added `ownerAdminId String @unique` (the AdminUser who owns this profile)
    - Added `ownerAdmin` relation with `onDelete: Cascade`
    - Added `compounders AdminUser[]` relation (back-reference from AdminUser.delegatedDoctorId)
    - Removed old `adminUsers AdminUser[]` relation
    - Changed default timezone to `Asia/Kolkata` (matches West Bengal user)

  ### Bot-side changes
  - **src/services/adminService.js**: `handleAdminAuth` now enforces role + verification:
    - `DOCTOR` must have `verificationStatus === VERIFIED`
    - `COMPOUNDER` must have an active delegated doctor whose owner is verified
    - `SUPER_ADMIN` bypasses verification
    - Returns `{ adminUser, magicLink, reason }` so the caller can show a specific
      verification-pending/rejected/suspended message
    - Added `registerDoctor({ name, phone, medicalRegNumber, specialization, chamberAddress, telegramChatId })`
    - Added `inviteCompounder({ doctorAdminId, compounderPhone })` (also creates the Doctor profile if missing)
    - Added `approveDoctor({ doctorAdminId, superAdminId })` (creates Doctor profile, sets VERIFIED)
  - **src/flows/admin.js**: Added the registration flow
    (`REGISTER_NAME` → `REGISTER_PHONE` → `REGISTER_MEDICAL_REG` → `REGISTER_SPECIALIZATION` → `REGISTER_CHAMBER`)
    and the invitation flow (`INVITE_PHONE`). Each step validates input and persists into session.
  - **src/bot/handler.js**: Added `/register` and `/invite` commands plus `menu_register` callback.
    Updated flow routing to forward `REGISTER_*` and `INVITE_*` session steps to the admin flow.
  - **src/utils/validators.js**: Added `validateMedicalRegNumber` (regex `^[A-Z]{2,3}\d{4,8}$`),
    `validatePhone` (E.164 format with `+` normalization), `validateSpecialization`.
  - **src/utils/messages.js**: Added Bengali + English + Hindi strings for `REGISTER_*`,
    `VERIFICATION_*`, `INVITE_*`, `BTN_REGISTER`, `BTN_INVITE`.

  ### Dashboard-side changes
  - **src/lib/auth.ts**: `createSessionForUser` and `getCurrentUser` now include
    `ownedDoctor` and `delegatedDoctor.ownerAdmin` in the AdminUser query.
  - **src/lib/api-helpers.ts**: Added `requireVerified`, `requireDoctor`, `requireSuperAdmin`
    helpers. Added `getDoctorScope(user)` which returns `{ doctorId }` filter for
    COMPOUNDER (via delegatedDoctorId) / DOCTOR (via ownedDoctor or DB lookup),
    and empty filter for SUPER_ADMIN. Added `canAccessDoctor(user, doctorId)` for
    per-resource ownership checks.
  - **src/app/api/auth/generate-magic-link/route.ts**: Rejects DOCTOR users with
    `verificationStatus !== VERIFIED` (returns 403 with specific error code
    `verification_pending` / `verification_rejected` / `verification_suspended`).
    Rejects COMPOUNDER users whose delegated doctor is inactive or unverified.
    Response now includes `role`, `verificationStatus`, `ownedDoctorId`, `delegatedDoctorId`.
  - **src/app/api/auth/me/route.ts**: Returns `role`, `verificationStatus`,
    `medicalRegNumber`, `specialization`, `ownedDoctorId`, `delegatedDoctorId`.
  - **src/app/api/doctors/route.ts**: GET scoped by `getDoctorScope`. POST restricted
    to DOCTOR / SUPER_ADMIN; sets `ownerAdminId` automatically; rejects if doctor
    already has an owned profile.
  - **src/app/api/doctors/[id]/route.ts**: All handlers gated by `canAccessDoctor`.
  - **src/app/api/schedules/route.ts**: GET scoped; POST verifies `canAccessDoctor` for
    the target `doctorId`.
  - **src/app/api/schedules/[id]/route.ts**: All handlers verify ownership of the schedule's doctor.
  - **src/app/api/appointments/route.ts**: GET scoped by `getDoctorScope` (replaces old
    `user.role === 'compounder' && user.doctorId` filter).
  - **src/app/api/appointments/[id]/route.ts**: DELETE uses `canAccessDoctor`.
  - **src/app/api/appointments/[id]/status/route.ts**: PATCH uses `canAccessDoctor`.
  - **src/app/api/appointments/[id]/reschedule/route.ts**: PATCH uses `canAccessDoctor`.
  - **src/app/api/appointments/walk-in/route.ts**: Verifies `canAccessDoctor` for the
    schedule's doctor.
  - **src/app/api/queue/next/route.ts**: Verifies `canAccessDoctor` for the schedule's doctor.
  - **src/app/api/audit-log/route.ts**: SUPER_ADMIN sees all; DOCTOR sees self + their
    compounders' logs; COMPOUNDER sees self + their delegated doctor's logs.
  - **src/app/api/me/failed-logins/route.ts**: Handles `email === null` (uses sentinel).
  - **src/app/api/analytics/route.ts**: Refactored to use `getDoctorScope` and the new
    `ownedDoctor` / `delegatedDoctorId` fields. Default timezone changed to `Asia/Kolkata`.
  - **src/components/providers.tsx**: Updated `AuthUser` type with `Role`, `VerificationStatus`,
    `medicalRegNumber`, `specialization`, `ownedDoctorId`, `delegatedDoctorId`.
  - **src/components/sidebar.tsx**: Nav items now support role-based filtering. Added
    `admin-verification` item for SUPER_ADMIN only. Footer shows role + verification status badge.
  - **src/components/app-shell.tsx**: Added `'admin-verification'` to `ViewKey` union.
  - **src/components/views/bot-access-required-view.tsx**: Updated DEMO_USERS to use new
    role strings; added a `/register` hint card so visitors know how to register as a doctor.
  - **src/components/views/dashboard-view.tsx**: Updated to use `user?.doctor?.id` instead
    of removed `user?.doctorId` for schedule scoping.
  - **src/components/views/appointments-view.tsx**: Same `user?.doctor?.id` fix.
  - **src/components/views/schedules-view.tsx**: Same fix; `isAdmin` now checks SUPER_ADMIN or DOCTOR.
  - **src/components/views/settings-view.tsx**: Added verification status badge, medical
    reg number, specialization display for doctors. Updated useCallback dep.
  - **src/components/views/doctors-view.tsx**: `isAdmin` checks SUPER_ADMIN.
  - **src/components/topbar.tsx**: Updated role comparison.
  - **src/lib/i18n.ts**: Added `'admin-verification'` string.

  ### Seed changes
  - **prisma/seed.js**: Now creates: 1 SUPER_ADMIN (founder), 2 VERIFIED doctors (with
    owned Doctor profiles + schedules), 1 PENDING doctor (for testing verification flow),
    1 COMPOUNDER (delegated to Dr. Arjun Sen). Uses `upsert` so re-running is safe.
  - **prisma/seed-superadmin.js** (new): Promotes a phone to SUPER_ADMIN. Usage:
    `node prisma/seed-superadmin.js +910000000001` or `SUPER_ADMIN_PHONE=... npm run db:seed-superadmin`.
  - **package.json**: Added `db:seed-superadmin` script.
  - **.env.example**: Documented new env vars: `NEXT_PUBLIC_DEV_BOT_SECRET`,
    `SUPER_ADMIN_PHONE`, `WHATSAPP_*`, `ERROR_WEBHOOK_URL`, `RAZORPAY_*`.

  ### Test updates
  - **tests/services/adminService.test.js**: Added mocks for `prisma.schedule.findUnique`
    and `prisma.adminUser.create`. Updated test data to include `role`, `verificationStatus`,
    `isActive`. Added tests for inactive-user rejection and PENDING-doctor login rejection.
  - **tests/flows/admin.test.js**: Updated mock for `prisma.rateLimitEntry.delete` to return
    a resolved Promise. Updated test data to use `ownedDoctor: { id: 'doc-1' }`. Added test
    for verification-pending message.

  ### Bonus: Task 1.2 scaffolding (admin verification API)
  - **src/app/api/admin/pending-doctors/route.ts** (new): Super-admin-only endpoint to list
    pending doctors.
  - **src/app/api/admin/verify-doctor/route.ts** (new): Super-admin-only endpoint to approve
    or reject a pending doctor. On approve, creates the Doctor profile if it doesn't exist.

  ### Verification
  - Bot lint: ✅ 0 errors, 6 warnings (all pre-existing)
  - Bot tests: ✅ 5 suites pass, 1 suite fails (dashboard integration — needs running server)
  - Dashboard lint: ✅ 0 errors, 0 warnings
  - Dashboard build: ✅ Compiled successfully, all routes generated

---

## Task 1.2 — Doctor verification flow (super admin review)

- **Status:** ⚠️ Partial (API endpoints done; UI view not yet implemented)
- **Commit:** (pending)
- **Notes:** The backend API for listing pending doctors and approving/rejecting them is
  implemented (see Task 1.1 notes above). The dashboard `admin-verification-view.tsx`
  component is referenced in the sidebar but not yet implemented. This will be done in
  a follow-up commit.

---

## Tasks 1.3 through 6.2

- **Status:** ⏸ Pending
- **Notes:** The remaining 16 tasks will be executed in subsequent sessions. Each builds
  on the Phase 1 foundation laid here. See `Dr_Booking_Advanced_Reform_Tasks.md` for the
  full task list.

---

## Blockers / Open Items

1. **No GitHub Personal Access Token (PAT) provided.** Without it, the agent cannot push
   commits to `https://github.com/tazla25/Dr_Booking.git`, so Vercel + Render will not
   auto-deploy. The user needs to either:
   - Provide a GitHub PAT (recommended scope: `repo`), OR
   - Push the local `reform/phase-1` branch themselves after reviewing the diff.

2. **No `DATABASE_URL` provided.** Without it, the agent cannot:
   - Run `npx prisma db push --accept-data-loss` to apply the schema migration to Supabase
   - Run `npm run db:seed` to populate test data
   - Run the dashboard integration tests

3. **No `TELEGRAM_BOT_TOKEN` or `BOT_API_SECRET` provided.** These are needed for the
   bot to actually run end-to-end. The dev dashboard secret
   (`NEXT_PUBLIC_DEV_BOT_SECRET`) is also needed for the local dev login panel.

## How to deploy this work

Once the user has the missing credentials:

```bash
# 1. Set up .env locally
cp .env.example .env
# Edit .env to fill in DATABASE_URL, TELEGRAM_BOT_TOKEN, BOT_API_SECRET, etc.
# Also set DASHBOARD_URL, PUBLIC_URL, NEXT_PUBLIC_BOT_URL, NEXT_PUBLIC_DEV_BOT_SECRET

# 2. Apply the schema migration (DESTRUCTIVE — drops old data, OK for pre-pilot)
npm run db:push

# 3. Seed the new schema
npm run db:seed

# 4. (Optional) Promote yourself to SUPER_ADMIN
SUPER_ADMIN_PHONE=+91YOURPHONE npm run db:seed-superadmin

# 5. Push to GitHub (need PAT)
git push origin reform/phase-1
# Or merge to main: git checkout main && git merge reform/phase-1 && git push origin main

# 6. Vercel + Render will auto-deploy from main. Verify in their dashboards.
```
