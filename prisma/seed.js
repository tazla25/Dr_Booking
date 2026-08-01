const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create a Doctor
  const doctor = await prisma.doctor.create({
    data: {
      fullName: 'Dr. Sarah Connor',
      specialization: 'General Physician',
      phone: '01700000000',
      fee: 500,
      rating: 4.8,
      isActive: true,
    },
  });
  console.log(`Created doctor: ${doctor.fullName}`);

  // 2. Create a Schedule for the Doctor
  const schedule = await prisma.schedule.create({
    data: {
      doctorId: doctor.id,
      pinCode: 1234, // PIN for legacy access
      dayOfWeek: 'Monday',
      startTime: '09:00',
      endTime: '17:00',
      clinicName: 'Health First Clinic',
      clinicAddress: '123 Main St, Dhaka',
      avgMinutesPerPatient: 15,
    },
  });
  console.log(`Created schedule with PIN ${schedule.pinCode} for ${doctor.fullName}`);

  // 3. Create an AdminUser (Bot-first identity)
  const admin = await prisma.adminUser.create({
    data: {
      doctorId: doctor.id,
      name: 'Admin Compounder',
      telegramChatId: 'mock_chat_id_123', // So user can test telegram integration
      role: 'compounder',
      isActive: true,
    },
  });
  console.log(`Created admin user: ${admin.name} for Doctor ${doctor.fullName}`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
