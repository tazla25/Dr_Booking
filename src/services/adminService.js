const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

/**
 * Handle admin authentication via WhatsApp number and generate magic link.
 *
 * DEPRECATED (v11): This function is the legacy magic-link flow. The bot
 * now uses phone + password login (see `authenticateUser` below). This is
 * kept for backward compatibility with any code paths that still call /admin
 * without going through the new login flow.
 *
 * @param {string} chatId - WhatsApp phone number in E.164 format
 * @returns {Object|null} { adminUser, magicLink } or null
 */
async function handleAdminAuth(chatId) {
  const adminUser = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { whatsappNumber: String(chatId) },
        { phone: String(chatId) },
      ],
    },
    include: {
      ownedDoctor: true,
      delegatedDoctor: { include: { ownerAdmin: true } },
    },
  });

  if (!adminUser) return null;
  if (adminUser.isActive === false) return null;

  // Role-based verification gate
  if (adminUser.role === 'DOCTOR') {
    if (adminUser.verificationStatus !== 'VERIFIED') {
      const logger = require('../utils/logger');
      logger.warn(
        { chatId, userId: adminUser.id, status: adminUser.verificationStatus },
        'Doctor login rejected — not verified'
      );
      return { adminUser, magicLink: null, reason: adminUser.verificationStatus };
    }
  } else if (adminUser.role === 'COMPOUNDER') {
    const doc = adminUser.delegatedDoctor;
    if (!doc || !doc.isActive) return { adminUser, magicLink: null, reason: 'SUSPENDED' };
    const owner = doc.ownerAdmin;
    if (!owner || !owner.isActive || owner.verificationStatus !== 'VERIFIED') {
      return { adminUser, magicLink: null, reason: 'SUSPENDED' };
    }
  }

  // Generate dashboard link via the magic-link API endpoint
  const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const magicLinkBody = { whatsappNumber: String(chatId) };

  let magicLink;
  try {
    const response = await fetch(`${baseUrl}/api/auth/generate-magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_API_SECRET}`
      },
      body: JSON.stringify(magicLinkBody)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to generate dashboard link');
    }
    magicLink = data.magicLink;
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error({ err: error.message }, 'Error generating dashboard link');
    return { adminUser, magicLink: null, reason: 'LINK_FAILED' };
  }

  return { adminUser, magicLink };
}

/**
 * Authenticate a user by phone + password (v11 login flow).
 *
 * Bug fix (v11): replaces the magic-link login. The entire flow happens in
 * WhatsApp — the bot asks for phone, then password, then verifies with
 * bcrypt, then generates a dashboard URL with a session token.
 *
 * @param {string} phone - phone number (E.164 or 10-digit Indian, will be normalized)
 * @param {string} password - plaintext password from user input
 * @returns {Object} { ok, user?, reason?, dashboardUrl? }
 */
async function authenticateUser(phone, password) {
  const { validatePhone } = require('../utils/validators');
  const normalizedPhone = validatePhone(phone);
  if (!normalizedPhone) {
    return { ok: false, reason: 'INVALID_PHONE' };
  }

  const user = await prisma.adminUser.findUnique({
    where: { phone: normalizedPhone },
    include: {
      ownedDoctor: true,
      delegatedDoctor: { include: { ownerAdmin: true } },
    },
  });

  if (!user) {
    return { ok: false, reason: 'USER_NOT_FOUND' };
  }
  if (user.isActive === false) {
    return { ok: false, reason: 'SUSPENDED' };
  }
  if (!user.passwordHash) {
    return { ok: false, reason: 'NO_PASSWORD' };
  }

  // Role-based verification gate
  if (user.role === 'DOCTOR' && user.verificationStatus !== 'VERIFIED') {
    return { ok: false, reason: user.verificationStatus };
  }
  if (user.role === 'COMPOUNDER') {
    const doc = user.delegatedDoctor;
    if (!doc || !doc.isActive) return { ok: false, reason: 'SUSPENDED' };
    const owner = doc.ownerAdmin;
    if (!owner || !owner.isActive || owner.verificationStatus !== 'VERIFIED') {
      return { ok: false, reason: 'SUSPENDED' };
    }
  }

  // Verify password (bcryptjs for cross-platform compat)
  const bcrypt = require('bcryptjs');
  let passwordValid;
  try {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error({ err: err.message, userId: user.id }, 'bcrypt compare failed');
    return { ok: false, reason: 'ERROR' };
  }

  if (!passwordValid) {
    return { ok: false, reason: 'INVALID_PASSWORD' };
  }

  // Password verified — create a Session directly in the DB (Feature 1).
  // This replaces the old flow that called /api/auth/generate-magic-link.
  // The bot has DATABASE_URL access, so it can write to the sessions table
  // directly. The dashboard's /auth/session page then validates this session
  // and sets the cookie.
  const crypto = require('crypto');
  const rawToken = crypto.randomBytes(32).toString('hex');
  // HMAC the token with BOT_API_SECRET (same secret the dashboard uses)
  const tokenHash = crypto
    .createHmac('sha256', process.env.BOT_API_SECRET || 'dev-session-secret')
    .update(rawToken)
    .digest('hex');

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  let session;
  try {
    session = await prisma.session.create({
      data: {
        adminUserId: user.id,
        tokenHash,
        expiresAt,
        userAgent: 'whatsapp-bot',
      },
    });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error({ err: err.message, userId: user.id }, 'Failed to create session for user');
    return { ok: false, reason: 'LINK_FAILED' };
  }

  // Update lastLoginAt
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  }).catch(() => {});

  // Build the dashboard URL with session ID + raw token
  const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const dashboardUrl = `${baseUrl}/auth/session?sid=${session.id}&token=${rawToken}`;

  return { ok: true, user, dashboardUrl };
}

const { formatInTimeZone } = require('date-fns-tz');

/**
 * Get today's patient list for a given schedule, ordered by queue number.
 *
 * @param {string} scheduleId
 * @returns {Array} patient rows
 */
async function getTodaysPatients(scheduleId) {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { doctor: true }
    });
    if (!schedule) return [];

    const tz = schedule.doctor?.timezone || 'Asia/Kolkata';
    const today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
    const appointments = await prisma.appointment.findMany({
      where: {
        scheduleId: scheduleId,
        appointmentDate: today
      },
      orderBy: { queueNumber: 'asc' },
      select: {
        id: true,
        patientName: true,
        queueNumber: true,
        status: true
      }
    });

    return appointments;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Update an appointment's status.
 *
 * @param {string} bookingId
 * @param {'Pending'|'Confirmed'|'Completed'|'Cancelled'} status
 * @param {string} doctorId - to scope the update
 * @returns {boolean} true on success
 */
async function updateAppointmentStatus(bookingId, status, doctorId) {
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: bookingId } });
    if (!existing) throw new Error('Appointment not found');
    if (existing.doctorId !== doctorId) throw new Error('Unauthorized access to update appointment for this doctor');

    await prisma.appointment.update({
      where: { id: bookingId },
      data: { status }
    });
    return true;
  } catch (error) {
    throw new AppointmentError(error.message, 'DB_ERROR');
  }
}

/**
 * Create a new doctor registration (pending verification).
 * Called by the bot when a doctor runs /register.
 *
 * Bug fix (v11): now accepts passwordHash (set by the bot after the new
 * REGISTER_PASSWORD step). Also surfaces specific Prisma error codes so
 * the caller can show a helpful message instead of "Something went wrong".
 *
 * @param {Object} params - { name, phone, medicalRegNumber, specialization, chamberAddress, whatsappNumber, passwordHash }
 * @returns {Object} the created AdminUser
 * @throws {AppointmentError} with code DUPLICATE_PHONE, DUPLICATE_REG, or DB_ERROR
 */
async function registerDoctor({
  name,
  phone,
  medicalRegNumber,
  specialization,
  chamberAddress,
  whatsappNumber,
  passwordHash,
}) {
  // Check for existing account with same phone
  const existing = await prisma.adminUser.findUnique({ where: { phone } });
  if (existing) {
    throw new AppointmentError(
      'An account with this phone already exists',
      'DUPLICATE_PHONE'
    );
  }

  // Check for existing medicalRegNumber
  const existingReg = await prisma.adminUser.findUnique({ where: { medicalRegNumber } });
  if (existingReg) {
    throw new AppointmentError(
      'This medical registration number is already registered',
      'DUPLICATE_REG'
    );
  }

  // Create the AdminUser (doctor, pending verification)
  // chamberAddress is stored in verificationDocs JSON for super admin review
  try {
    const adminUser = await prisma.adminUser.create({
      data: {
        name,
        phone,
        medicalRegNumber,
        specialization,
        role: 'DOCTOR',
        verificationStatus: 'PENDING',
        whatsappNumber: whatsappNumber || null,
        passwordHash: passwordHash || null,
        verificationDocs: chamberAddress ? { chamberAddress } : null,
        isActive: true,
      },
    });

    return adminUser;
  } catch (err) {
    // Surface specific Prisma error codes so the bot can show helpful messages
    if (err.code === 'P2002') {
      // Unique constraint violation — phone or medicalRegNumber already taken
      const target = err.meta?.target || [];
      if (target.includes('phone')) {
        throw new AppointmentError('An account with this phone already exists', 'DUPLICATE_PHONE');
      }
      if (target.includes('medicalRegNumber')) {
        throw new AppointmentError('This medical registration number is already registered', 'DUPLICATE_REG');
      }
      if (target.includes('whatsappNumber')) {
        throw new AppointmentError('This WhatsApp number is already linked to another account', 'DUPLICATE_WHATSAPP');
      }
      throw new AppointmentError('An account with these details already exists', 'DUPLICATE');
    }
    // P2021: table doesn't exist — migration not run
    // P2022: column doesn't exist
    if (err.code === 'P2021' || err.code === 'P2022') {
      const logger = require('../utils/logger');
      logger.error({ code: err.code, err: err.message }, 'Database schema error — migration not run?');
      throw new AppointmentError('Database error. Please contact the admin.', 'DB_ERROR');
    }
    throw err;
  }
}

/**
 * Invite a compounder to a verified doctor's profile.
 * Creates an AdminUser (compounder) with delegatedDoctorId pointing to the
 * doctor's owned Doctor profile. If a Doctor profile doesn't exist yet, this
 * also creates it.
 *
 * @param {Object} params - { doctorAdminId, compounderPhone }
 * @returns {Object} the created AdminUser (compounder)
 */
async function inviteCompounder({ doctorAdminId, compounderPhone }) {
  const doctor = await prisma.adminUser.findUnique({
    where: { id: doctorAdminId },
    include: { ownedDoctor: true },
  });

  if (!doctor || doctor.role !== 'DOCTOR' || doctor.verificationStatus !== 'VERIFIED') {
    throw new AppointmentError(
      'Only verified doctors can invite compounders',
      'FORBIDDEN'
    );
  }

  // Ensure the doctor has a Doctor profile (should be created at verification time)
  let doctorProfile = doctor.ownedDoctor;
  if (!doctorProfile) {
    doctorProfile = await prisma.doctor.create({
      data: {
        ownerAdminId: doctor.id,
        fullName: doctor.name,
        specialization: doctor.specialization || 'General Physician',
        phone: doctor.phone,
        isActive: true,
      },
    });
  }

  // Check if compounder already exists
  const existing = await prisma.adminUser.findUnique({
    where: { phone: compounderPhone },
  });
  if (existing) {
    throw new AppointmentError(
      'An account with this phone already exists',
      'DUPLICATE_PHONE'
    );
  }

  // Create the compounder AdminUser (PENDING verification — but compounders
  // don't go through the medical-reg verification flow; they inherit from
  // the doctor. We set verificationStatus = VERIFIED so they can log in
  // immediately once their delegatedDoctor is set.)
  const compounder = await prisma.adminUser.create({
    data: {
      name: `Compounder (${compounderPhone})`,
      phone: compounderPhone,
      role: 'COMPOUNDER',
      verificationStatus: 'VERIFIED', // inherits trust from the doctor
      delegatedDoctorId: doctorProfile.id,
      invitedBy: doctor.phone,
      invitedAt: new Date(),
      isActive: true,
    },
  });

  return compounder;
}

/**
 * Approve a pending doctor (super admin only).
 * Creates the Doctor profile owned by the newly-approved admin user.
 *
 * @param {Object} params - { doctorAdminId, superAdminId }
 * @returns {Object} { adminUser, doctorProfile }
 */
async function approveDoctor({ doctorAdminId, superAdminId }) {
  const adminUser = await prisma.adminUser.findUnique({
    where: { id: doctorAdminId },
    include: { ownedDoctor: true },
  });

  if (!adminUser || adminUser.role !== 'DOCTOR') {
    throw new AppointmentError('Doctor not found', 'NOT_FOUND');
  }

  if (adminUser.verificationStatus !== 'PENDING') {
    throw new AppointmentError(
      `Doctor is already ${adminUser.verificationStatus}`,
      'INVALID_STATE'
    );
  }

  const updated = await prisma.adminUser.update({
    where: { id: doctorAdminId },
    data: {
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedBy: superAdminId,
    },
  });

  // Create the Doctor profile if it doesn't exist yet
  let doctorProfile = adminUser.ownedDoctor;
  if (!doctorProfile) {
    doctorProfile = await prisma.doctor.create({
      data: {
        ownerAdminId: adminUser.id,
        fullName: adminUser.name,
        specialization: adminUser.specialization || 'General Physician',
        phone: adminUser.phone,
        isActive: true,
      },
    });
  }

  return { adminUser: updated, doctorProfile };
}

module.exports = {
  handleAdminAuth,
  authenticateUser,
  getTodaysPatients,
  updateAppointmentStatus,
  registerDoctor,
  inviteCompounder,
  approveDoctor,
};
