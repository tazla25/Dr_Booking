import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let datasourceUrl = process.env.DATABASE_URL
if (datasourceUrl && !datasourceUrl.includes('pgbouncer=true')) {
  datasourceUrl += (datasourceUrl.includes('?') ? '&' : '?') + 'pgbouncer=true'
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    datasourceUrl,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db