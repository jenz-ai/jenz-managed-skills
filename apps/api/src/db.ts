import { PrismaClient } from '@prisma/client';

// Single shared client. Routes + the gate import this.
export const prisma = new PrismaClient();
