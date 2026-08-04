const { AppointmentError } = require('../utils/errors');
const prisma = require('../database/prisma');

/**
 * Handle admin authentication via WhatsApp number and generate magic link.
 *
 * Phase 2 (WhatsApp migration): Telegram is gone. The chatId passed in is
 * now a phone number in E.164 format (e.g., +919876543210). We look up
 * the AdminUser by whatsappNumber, falling back to phone for legacy
 * accounts that haven't been re-linked yet.
 *
 * Verification gates:
 *   - User exists with the given whatsappNumber (or phone fallback)
 *   - User is active
 *   - User has an approved role (DOCTOR / COMPOUNDER / SUPER_ADMIN)
 *   - DOCTOR users must have verificationStatus === VERIFIED
 *   - COMPOUNDER users must have a delegatedDoctor that is VERIFIED and active
 *   - SUPER_ADMIN users are always allowed (no verification needed)
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
  // Treat explicitly-false as inactive; undefined (legacy/mock) as active
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
    // Compounder must have an active, verified delegated doctor
    const doc = adminUser.delegatedDoctor;
    if (!doc || !doc.isActive) return { adminUser, magicLink: null, reason: 'SUSPENDED' };
    const owner = doc.ownerAdmin;
    if (!owner || !owner.isActive || owner.verificationStatus !== 'VERIFIED') {
      return { adminUser, magicLink: null, reason: 'SUSPENDED' };
    }
  }
  // SUPER_ADMIN: no extra checks

  const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  // Send whatsappNumber to the magic-link endpoint (WhatsApp-only)
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
      throw new Error(data.message || 'Failed to generate magic link');
    }
    magicLink = data.magicLink;
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error({ err: error.message }, 'Error generating magic link');
    return { adminUser, magicLink: null, reason: 'LINK_FAILED' };
  }

  return { adminUser, magicLink };
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
 * @param {Object} params - { name, phone, medicalRegNumber, specialization, chamberAddress, whatsappNumber }
 * @returns {Object} the created AdminUser
 */
async function registerDoctor({
  name,
  phone,
  medicalRegNumber,
  specialization,
  chamberAddress,
  whatsappNumber,
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
  // (it will be used to seed the doctor's first Schedule once approved)
  const adminUser = await prisma.adminUser.create({
    data: {
      name,
      phone,
      medicalRegNumber,
      specialization,
      role: 'DOCTOR',
      verificationStatus: 'PENDING',
      whatsappNumber: whatsappNumber || null,
      verificationDocs: chamberAddress ? { chamberAddress } : null,
      isActive: true,
    },
  });

  return adminUser;
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
  getTodaysPatients,
  updateAppointmentStatus,
  registerDoctor,
  inviteCompounder,
  approveDoctor,
};
