import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

let currentPrisma: PrismaClient | null = null;

export function setPrismaD1(d1Database: any) {
  if (!currentPrisma || !(currentPrisma as any)._isD1) {
    const adapter = new PrismaD1(d1Database);
    currentPrisma = new PrismaClient({ adapter });
    (currentPrisma as any)._isD1 = true;
  }
}

function getDefaultPrisma(): PrismaClient {
  if (!currentPrisma) {
    const adapter = new PrismaLibSql({
      url: process.env.DATABASE_URL || "file:./dev.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
    currentPrisma = new PrismaClient({ adapter });
  }
  return currentPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = currentPrisma || getDefaultPrisma();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

