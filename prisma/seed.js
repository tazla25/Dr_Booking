// prisma/seed.js
//
// Phase 1 reform seed: creates a super admin (founder), a verified doctor
// with an owned Doctor profile, and an invited compounder.
//
// Run with: `npm run db:seed` (after `npm run db:push`)

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create the SUPER_ADMIN (the founder)
  //    This is the only account that can verify new doctors.
  const superAdmin = await prisma.adminUser.upsert({
    where: { phone: '+910000000001' },
    update: {
      role: 'SUPER_ADMIN',
      verificationStatus: 'VERIFIED',
      isActive: true,
      name: 'Founder (Super Admin)',
    },
    create: {
      phone: '+910000000001',
      name: 'Founder (Super Admin)',
      role: 'SUPER_ADMIN',
      verificationStatus: 'VERIFIED',
      telegramChatId: '100000001',
      isActive: true,
    },
  });
  console.log(`Upserted super admin: ${superAdmin.name} (${superAdmin.phone})`);

  // 2. Create a verified doctor + their Doctor profile + schedules
  const doctorAdmin = await prisma.adminUser.upsert({
    where: { phone: '+919876543210' },
    update: {},
    create: {
      phone: '+919876543210',
      name: 'Dr. Arjun Sen',
      role: 'DOCTOR',
      verificationStatus: 'VERIFIED',
      medicalRegNumber: 'WBMC12345',
      specialization: 'General Physician',
      telegramChatId: '100000002',
      verifiedAt: new Date(),
      verifiedBy: superAdmin.id,
      isActive: true,
    },
  });
  console.log(`Upserted doctor admin: ${doctorAdmin.name} (${doctorAdmin.phone})`);

  // Create the Doctor profile owned by this admin
  const doctor1 = await prisma.doctor.upsert({
    where: { ownerAdminId: doctorAdmin.id },
    update: {},
    create: {
      ownerAdminId: doctorAdmin.id,
      fullName: doctorAdmin.name,
      specialization: 'General Physician',
      phone: doctorAdmin.phone,
      fee: 500,
      rating: 4.8,
      isActive: true,
      timezone: 'Asia/Kolkata',
      schedules: {
        create: [
          {
            pinCode: 721401, // Contai, Purba Medinipur
            dayOfWeek: 'Monday',
            startTime: '09:00',
            endTime: '13:00',
            clinicName: 'Health First Clinic',
            clinicAddress: '123 Main St, Contai, Purba Medinipur',
            avgMinutesPerPatient: 15,
          },
          {
            pinCode: 721401,
            dayOfWeek: 'Wednesday',
            startTime: '15:00',
            endTime: '20:00',
            clinicName: 'Health First Clinic',
            clinicAddress: '123 Main St, Contai, Purba Medinipur',
            avgMinutesPerPatient: 15,
          },
        ],
      },
    },
    include: { schedules: true },
  });
  console.log(`Upserted doctor profile: ${doctor1.fullName} (${doctor1.schedules.length} schedules)`);

  // 3. Create a verified doctor #2 (Cardiologist)
  const doctorAdmin2 = await prisma.adminUser.upsert({
    where: { phone: '+919876543211' },
    update: {},
    create: {
      phone: '+919876543211',
      name: 'Dr. Meera Chowdhury',
      role: 'DOCTOR',
      verificationStatus: 'VERIFIED',
      medicalRegNumber: 'WBMC67890',
      specialization: 'Cardiologist',
      telegramChatId: '100000004',
      verifiedAt: new Date(),
      verifiedBy: superAdmin.id,
      isActive: true,
    },
  });

  const doctor2 = await prisma.doctor.upsert({
    where: { ownerAdminId: doctorAdmin2.id },
    update: {},
    create: {
      ownerAdminId: doctorAdmin2.id,
      fullName: doctorAdmin2.name,
      specialization: 'Cardiologist',
      phone: doctorAdmin2.phone,
      fee: 1200,
      rating: 4.9,
      isActive: true,
      timezone: 'Asia/Kolkata',
      schedules: {
        create: [
          {
            pinCode: 700001, // Kolkata
            dayOfWeek: 'Tuesday',
            startTime: '10:00',
            endTime: '14:00',
            clinicName: 'Heart Care Center',
            clinicAddress: '45 Park Street, Kolkata',
            avgMinutesPerPatient: 20,
          },
        ],
      },
    },
    include: { schedules: true },
  });
  console.log(`Upserted doctor profile: ${doctor2.fullName} (${doctor2.schedules.length} schedules)`);

  // 4. Create a PENDING doctor (for testing the verification flow)
  const pendingDoctor = await prisma.adminUser.upsert({
    where: { phone: '+919876543299' },
    update: {},
    create: {
      phone: '+919876543299',
      name: 'Dr. Pending Applicant',
      role: 'DOCTOR',
      verificationStatus: 'PENDING',
      medicalRegNumber: 'WBMC99999',
      specialization: 'Pediatrician',
      telegramChatId: '100000099',
      isActive: true,
      verificationDocs: { chamberAddress: '88 Dhanmondi, Kolkata' },
    },
  });
  console.log(`Upserted PENDING doctor: ${pendingDoctor.name} (${pendingDoctor.phone})`);

  // 5. Create an invited compounder (delegated to Dr. Arjun Sen)
  const compounder1 = await prisma.adminUser.upsert({
    where: { phone: '+919876543220' },
    update: {},
    create: {
      phone: '+919876543220',
      name: 'Ramesh (Compounder for Dr. Arjun Sen)',
      role: 'COMPOUNDER',
      verificationStatus: 'VERIFIED', // Compounders inherit trust from their doctor
      delegatedDoctorId: doctor1.id,
      invitedBy: doctorAdmin.phone,
      invitedAt: new Date(),
      telegramChatId: '100000003',
      isActive: true,
    },
  });
  console.log(`Upserted compounder: ${compounder1.name} (${compounder1.phone})`);

  console.log('Seed completed successfully!');
  console.log('───────────────────────────────────');
  console.log('Test accounts (telegramChatId → role):');
  console.log('  100000001 → SUPER_ADMIN (Founder)');
  console.log('  100000002 → DOCTOR (Dr. Arjun Sen, VERIFIED)');
  console.log('  100000003 → COMPOUNDER (Ramesh, delegated to Dr. Arjun Sen)');
  console.log('  100000004 → DOCTOR (Dr. Meera Chowdhury, VERIFIED)');
  console.log('  100000099 → DOCTOR (Dr. Pending Applicant, PENDING)');
  console.log('───────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
