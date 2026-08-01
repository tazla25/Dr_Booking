const { PrismaClient } = require('@prisma/client');

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl && !datasourceUrl.includes('pgbouncer=true')) {
  datasourceUrl += (datasourceUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
}

const prisma = new PrismaClient({
  datasourceUrl
});
module.exports = prisma;
