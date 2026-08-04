// prisma/seed.js
//
// Comprehensive seed data for testing Dr_Booking.
// Creates:
//   - 1 SUPER_ADMIN (founder) with whatsappNumber +91 00 0000 0001
//   - 3 VERIFIED doctors with their own Doctor profiles + schedules + whatsappNumbers
//   - 1 PENDING doctor (for testing verification flow)
//   - 1 COMPOUNDER delegated to Dr. Arjun Sen
//   - Sample appointments (mix of online + walk-in, various statuses)
//   - Sample feedback
//
// Phase 2 (WhatsApp migration): all identifiers are now E.164 phone numbers
// suitable for WhatsApp Cloud API.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { formatInTimeZone } = require('date-fns-tz');

async function main() {
  console.log('Starting comprehensive seed...');

  // ── 1. SUPER_ADMIN (founder) ───────────────────────────────────────
  const superAdmin = await prisma.adminUser.upsert({
    where: { phone: '+910000000001' },
    update: { role: 'SUPER_ADMIN', verificationStatus: 'VERIFIED', isActive: true, name: 'Founder (Super Admin)', whatsappNumber: '+910000000001' },
    create: {
      phone: '+910000000001', name: 'Founder (Super Admin)', role: 'SUPER_ADMIN',
      verificationStatus: 'VERIFIED', whatsappNumber: '+910000000001', isActive: true,
    },
  });
  console.log(`✅ Super admin: ${superAdmin.name} (whatsappNumber: +910000000001)`);

  // ── 2. VERIFIED DOCTORS ────────────────────────────────────────────
  const doctorsData = [
    {
      phone: '+919876543210', name: 'Dr. Arjun Sen', medReg: 'WBMC12345', spec: 'General Physician',
      whatsappNumber: '+919876543210', fee: 500, rating: 4.8,
      yearsExperience: 15, isTopPick: false, specialties: ['Fever', 'Cold', 'BP', 'Diabetes'],
      schedules: [
        { pinCode: 721401, day: 'Monday', start: '09:00', end: '13:00', clinic: 'Health First Clinic', addr: '123 Main St, Contai, Purba Medinipur', landmark: 'Contai Bus Stand-এর পাশে', avg: 15 },
        { pinCode: 721401, day: 'Wednesday', start: '15:00', end: '20:00', clinic: 'Health First Clinic', addr: '123 Main St, Contai, Purba Medinipur', landmark: 'Contai Bus Stand-এর পাশে', avg: 15 },
        { pinCode: 721636, day: 'Friday', start: '10:00', end: '14:00', clinic: 'Tamluk Medical', addr: '45 Station Rd, Tamluk, Purba Medinipur', landmark: 'Tamluk Station-এর কাছে', avg: 12 },
      ],
    },
    {
      phone: '+919876543211', name: 'Dr. Meera Chowdhury', medReg: 'WBMC67890', spec: 'Cardiologist',
      whatsappNumber: '+919876543211', fee: 1200, rating: 4.9,
      yearsExperience: 20, isTopPick: true, specialties: ['Chest Pain', 'Heart Disease', 'BP Problems', 'Palpitation'],
      schedules: [
        { pinCode: 700001, day: 'Tuesday', start: '10:00', end: '14:00', clinic: 'Heart Care Center', addr: '45 Park Street, Kolkata', landmark: 'Park Street Metro-এর কাছে', avg: 20 },
        { pinCode: 700001, day: 'Saturday', start: '16:00', end: '20:00', clinic: 'Heart Care Center', addr: '45 Park Street, Kolkata', landmark: 'Park Street Metro-এর কাছে', avg: 20 },
      ],
    },
    {
      phone: '+919876543212', name: 'Dr. Rahul Pramanik', medReg: 'WBMC54321', spec: 'Pediatrician',
      whatsappNumber: '+919876543212', fee: 800, rating: 4.7,
      yearsExperience: 8, isTopPick: false, specialties: ['Child Fever', 'Vaccination', 'Child Nutrition'],
      schedules: [
        { pinCode: 721401, day: 'Thursday', start: '08:00', end: '12:00', clinic: 'Happy Kids Care', addr: '88 Market Rd, Contai, Purba Medinipur', landmark: 'Contai Market-এর পাশে', avg: 10 },
        { pinCode: 721636, day: 'Sunday', start: '11:00', end: '15:00', clinic: 'Happy Kids Care', addr: '88 Station Rd, Tamluk, Purba Medinipur', landmark: 'Tamluk Court-এর কাছে', avg: 10 },
      ],
    },
  ];

  const createdDoctors = [];
  for (const dd of doctorsData) {
    // Create the AdminUser (doctor)
    const adminUser = await prisma.adminUser.upsert({
      where: { phone: dd.phone },
      update: { whatsappNumber: dd.whatsappNumber },
      create: {
        phone: dd.phone, name: dd.name, role: 'DOCTOR', verificationStatus: 'VERIFIED',
        medicalRegNumber: dd.medReg, specialization: dd.spec, whatsappNumber: dd.whatsappNumber,
        verifiedAt: new Date(), verifiedBy: superAdmin.id, isActive: true,
      },
    });

    // Create the Doctor profile
    const doctor = await prisma.doctor.upsert({
      where: { ownerAdminId: adminUser.id },
      update: {},
      create: {
        ownerAdminId: adminUser.id, fullName: dd.name, specialization: dd.spec,
        phone: dd.phone, fee: dd.fee, rating: dd.rating, isActive: true, timezone: 'Asia/Kolkata',
        yearsExperience: dd.yearsExperience || 0,
        isTopPick: dd.isTopPick || false,
        specialties: dd.specialties || [],
        avgRating: dd.rating || 0,
        reviewCount: Math.floor(Math.random() * 30) + 10, // mock review count
        appointmentCount: Math.floor(Math.random() * 500) + 50, // mock patient count
        isAvailableNow: true,
        schedules: { create: dd.schedules.map(s => ({ pinCode: s.pinCode, dayOfWeek: s.day, startTime: s.start, endTime: s.end, clinicName: s.clinic, clinicAddress: s.addr, landmark: s.landmark || null, avgMinutesPerPatient: s.avg })) },
      },
      include: { schedules: true },
    });
    console.log(`✅ Doctor: ${doctor.fullName} (whatsappNumber: ${dd.whatsappNumber}, ${doctor.schedules.length} schedules)`);
    createdDoctors.push({ adminUser, doctor, schedules: doctor.schedules });
  }

  // ── 3. PENDING DOCTOR (for testing verification flow) ─────────────
  const pendingDoctor = await prisma.adminUser.upsert({
    where: { phone: '+919876543299' },
    update: { whatsappNumber: '+919876543299' },
    create: {
      phone: '+919876543299', name: 'Dr. Pending Applicant', role: 'DOCTOR',
      verificationStatus: 'PENDING', medicalRegNumber: 'WBMC99999', specialization: 'Dermatologist',
      whatsappNumber: '+919876543299', isActive: true,
      verificationDocs: { chamberAddress: '123 Salt Lake, Kolkata' },
    },
  });
  console.log(`✅ Pending doctor: ${pendingDoctor.name} (whatsappNumber: +919876543299)`);

  // ── 4. COMPOUNDER (delegated to Dr. Arjun Sen) ─────────────────────
  const arjunDoctor = createdDoctors[0].doctor;
  const compounder = await prisma.adminUser.upsert({
    where: { phone: '+919876543220' },
    update: { whatsappNumber: '+919876543220' },
    create: {
      phone: '+919876543220', name: 'Ramesh (Compounder for Dr. Arjun Sen)',
      role: 'COMPOUNDER', verificationStatus: 'VERIFIED',
      delegatedDoctorId: arjunDoctor.id, invitedBy: '+919876543210', invitedAt: new Date(),
      whatsappNumber: '+919876543220', isActive: true,
    },
  });
  console.log(`✅ Compounder: ${compounder.name} (whatsappNumber: +919876543220, delegated to Dr. Arjun Sen)`);

  // ── 5. SAMPLE APPOINTMENTS ─────────────────────────────────────────
  // Create some appointments for today and recent days
  const today = formatInTimeZone(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  const yesterday = formatInTimeZone(new Date(Date.now() - 86400000), 'Asia/Kolkata', 'yyyy-MM-dd');
  const twoDaysAgo = formatInTimeZone(new Date(Date.now() - 2 * 86400000), 'Asia/Kolkata', 'yyyy-MM-dd');

  // Find Dr. Arjun Sen's Monday schedule (or whichever matches today)
  const arjunSchedules = createdDoctors[0].schedules;
  const allSchedules = createdDoctors.flatMap(d => d.schedules);

  // Create appointments for today on Arjun's first schedule
  const todaySchedule = arjunSchedules[0];
  const todayDayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  // Only create today's appointments if the schedule matches today's day
  let appointmentCount = 0;
  if (todaySchedule.dayOfWeek === todayDayName) {
    const patients = [
      { name: 'Rahul Das', phone: '100000101', status: 'Completed', queue: 1 },
      { name: 'Sita Roy', phone: '100000102', status: 'Completed', queue: 2 },
      { name: 'Amit Khan', phone: '100000103', status: 'Confirmed', queue: 3 },
      { name: 'Priya Sen', phone: '100000104', status: 'Confirmed', queue: 4 },
      { name: 'Walk-in Patient 1', phone: '+0000000000', status: 'Confirmed', queue: 5 },
      { name: 'Walk-in Patient 2', phone: '+0000000000', status: 'Confirmed', queue: 6 },
    ];
    for (const p of patients) {
      await prisma.appointment.create({
        data: {
          scheduleId: todaySchedule.id, doctorId: arjunDoctor.id,
          patientName: p.name, patientPhone: p.phone, appointmentDate: today,
          queueNumber: p.queue, status: p.status,
        },
      });
      appointmentCount++;
    }
  }

  // Create some past appointments for history testing
  for (const sched of allSchedules) {
    // Check if the schedule's dayOfWeek matches yesterday or 2 days ago
    const yDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(Date.now() - 86400000).getDay()];
    const tdDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(Date.now() - 2 * 86400000).getDay()];
    const dates = [];
    if (sched.dayOfWeek === yDay) dates.push(yesterday);
    if (sched.dayOfWeek === tdDay) dates.push(twoDaysAgo);

    for (const date of dates) {
      for (let i = 1; i <= 3; i++) {
        try {
          await prisma.appointment.create({
            data: {
              scheduleId: sched.id, doctorId: sched.doctorId,
              patientName: `Patient ${i} (${sched.clinicName || 'Clinic'})`,
              patientPhone: `10000020${i}`, appointmentDate: date,
              queueNumber: i, status: i === 1 ? 'Completed' : i === 2 ? 'NoShow' : 'Cancelled',
              reminderSent: true,
            },
          });
          appointmentCount++;
        } catch (e) { /* skip if unique constraint fails */ }
      }
    }
  }

  console.log(`✅ Created ${appointmentCount} sample appointments`);

  // ── 6. SAMPLE FEEDBACK ─────────────────────────────────────────────
  // Find completed appointments and add feedback to some
  const completedAppts = await prisma.appointment.findMany({
    where: { status: 'Completed' },
    take: 5,
  });

  let feedbackCount = 0;
  for (let i = 0; i < Math.min(3, completedAppts.length); i++) {
    const appt = completedAppts[i];
    try {
      await prisma.feedback.create({
        data: {
          appointmentId: appt.id,
          rating: [5, 4, 5, 3, 4][i % 5],
          comment: ['খুব ভালো অভিজ্ঞতা। ডাক্তার খুব যত্নশীল।', 'Good service, quick appointment.', 'সিরিয়াল সিস্টেম চমৎকার।', 'Wait time was a bit long but doctor was good.', 'মোটামুটি।'][i % 5],
        },
      });
      feedbackCount++;
    } catch (e) { /* skip if already exists */ }
  }
  console.log(`✅ Created ${feedbackCount} feedback entries`);

  // ── 7. SAMPLE AUDIT LOGS ───────────────────────────────────────────
  await prisma.auditLog.create({
    data: { adminUserId: superAdmin.id, action: 'magic_link_login', detail: 'Super admin login via magic link', ipAddress: '127.0.0.1' },
  });
  await prisma.auditLog.create({
    data: { adminUserId: createdDoctors[0].adminUser.id, action: 'magic_link_login', detail: 'Doctor login via magic link', ipAddress: '127.0.0.1' },
  });
  console.log(`✅ Created sample audit logs`);

  // ── SUMMARY ────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SEED COMPLETE — TEST ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Role                | Name                    | whatsappNumber');
  console.log('────────────────────|─────────────────────────|─────────────────');
  console.log('SUPER_ADMIN         | Founder                 | +910000000001');
  console.log('DOCTOR (VERIFIED)   | Dr. Arjun Sen           | +919876543210');
  console.log('COMPOUNDER          | Ramesh (for Dr. Arjun)  | +919876543220');
  console.log('DOCTOR (VERIFIED)   | Dr. Meera Chowdhury     | +919876543211');
  console.log('DOCTOR (VERIFIED)   | Dr. Rahul Pramanik      | +919876543212');
  console.log('DOCTOR (PENDING)    | Dr. Pending Applicant   | +919876543299');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Patients (for testing /history):');
  console.log('  +9100000101 — Rahul Das (has appointments with Dr. Arjun Sen)');
  console.log('  +9100000102 — Sita Roy');
  console.log('  +9100000103 — Amit Khan');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('To test via the dashboard dev panel:');
  console.log('  1. Open the dashboard URL');
  console.log('  2. Click any demo user button in the Dev Panel');
  console.log('  3. Or use the bot: send /admin from the WhatsApp number above');
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
