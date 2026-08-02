const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // 1. Create Doctor 1 (General Physician)
  const doc1 = await prisma.doctor.create({
    data: {
      fullName: 'Dr. Sarah Connor',
      specialization: 'General Physician',
      phone: '01700000001',
      fee: 500,
      rating: 4.8,
      isActive: true,
      schedules: {
        create: [
          {
            pinCode: 111111, // Using 6 digit pins now
            dayOfWeek: 'Monday',
            startTime: '09:00',
            endTime: '13:00',
            clinicName: 'Health First Clinic',
            clinicAddress: '123 Main St, Dhaka',
            avgMinutesPerPatient: 15,
          },
          {
            pinCode: 111111,
            dayOfWeek: 'Wednesday',
            startTime: '15:00',
            endTime: '20:00',
            clinicName: 'Health First Clinic',
            clinicAddress: '123 Main St, Dhaka',
            avgMinutesPerPatient: 15,
          }
        ]
      },
      adminUsers: {
        create: {
          name: 'Sarah Compounder',
          telegramChatId: 'mock_chat_sarah', 
          role: 'compounder',
          isActive: true,
        }
      }
    },
  });
  console.log(`Created doctor: ${doc1.fullName}`);

  // 2. Create Doctor 2 (Cardiologist)
  const doc2 = await prisma.doctor.create({
    data: {
      fullName: 'Dr. Ahmed Khan',
      specialization: 'Cardiologist',
      phone: '01700000002',
      fee: 1200,
      rating: 4.9,
      isActive: true,
      schedules: {
        create: [
          {
            pinCode: 222222,
            dayOfWeek: 'Sunday',
            startTime: '10:00',
            endTime: '14:00',
            clinicName: 'Heart Care Center',
            clinicAddress: '45 Banani, Dhaka',
            avgMinutesPerPatient: 20,
          },
          {
            pinCode: 222222,
            dayOfWeek: 'Tuesday',
            startTime: '17:00',
            endTime: '21:00',
            clinicName: 'Heart Care Center',
            clinicAddress: '45 Banani, Dhaka',
            avgMinutesPerPatient: 20,
          }
        ]
      },
      adminUsers: {
        create: {
          name: 'Ahmed Compounder',
          telegramChatId: 'mock_chat_ahmed',
          role: 'compounder',
          isActive: true,
        }
      }
    },
  });
  console.log(`Created doctor: ${doc2.fullName}`);

  // 3. Create Doctor 3 (Pediatrician)
  const doc3 = await prisma.doctor.create({
    data: {
      fullName: 'Dr. Fatima Rahman',
      specialization: 'Pediatrician',
      phone: '01700000003',
      fee: 800,
      rating: 4.7,
      isActive: true,
      schedules: {
        create: [
          {
            pinCode: 333333,
            dayOfWeek: 'Thursday',
            startTime: '08:00',
            endTime: '12:00',
            clinicName: 'Happy Kids Care',
            clinicAddress: '88 Dhanmondi, Dhaka',
            avgMinutesPerPatient: 10,
          },
          {
            pinCode: 333333,
            dayOfWeek: 'Saturday',
            startTime: '16:00',
            endTime: '20:00',
            clinicName: 'Happy Kids Care',
            clinicAddress: '88 Dhanmondi, Dhaka',
            avgMinutesPerPatient: 10,
          }
        ]
      },
      adminUsers: {
        create: {
          name: 'Fatima Compounder',
          telegramChatId: 'mock_chat_fatima',
          role: 'compounder',
          isActive: true,
        }
      }
    },
  });
  console.log(`Created doctor: ${doc3.fullName}`);

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
