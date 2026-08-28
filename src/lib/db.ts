import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma instance. Next.js dev-mode hot reload re-evaluates modules on
 * every change, so without the global cache each edit opens another connection
 * pool and the database runs out of connections within a few minutes.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
