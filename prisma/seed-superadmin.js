// prisma/seed-superadmin.js
//
// Promotes an existing AdminUser (looked up by phone) to SUPER_ADMIN,
// or creates one if it doesn't exist.
//
// Usage:
//   node prisma/seed-superadmin.js +910000000001
//
// Or set SUPER_ADMIN_PHONE env var and run:
//   SUPER_ADMIN_PHONE=+910000000001 npm run db:seed-superadmin

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2] || process.env.SUPER_ADMIN_PHONE;
  if (!phone) {
    console.error('Usage: node prisma/seed-superadmin.js +919876543210');
    console.error('   Or: SUPER_ADMIN_PHONE=+919876543210 node prisma/seed-superadmin.js');
    process.exit(1);
  }

  const result = await prisma.adminUser.upsert({
    where: { phone },
    update: {
      role: 'SUPER_ADMIN',
      verificationStatus: 'VERIFIED',
      isActive: true,
      whatsappNumber: phone,
    },
    create: {
      phone,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      verificationStatus: 'VERIFIED',
      isActive: true,
      whatsappNumber: phone,
    },
  });

  console.log(`✅ Super admin ready: ${result.name} (${result.phone})`);
  console.log(`   ID: ${result.id}`);
  console.log(`   Role: ${result.role}`);
  console.log(`   Verification: ${result.verificationStatus}`);
  console.log(`   WhatsApp Number: ${result.whatsappNumber}`);
  console.log('');
  console.log('To activate this account in the bot, the user should:');
  console.log('  1. Send /start to the bot from their WhatsApp');
  console.log('  2. Send /admin to receive a magic link');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
