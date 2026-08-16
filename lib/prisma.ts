import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 connects through a driver adapter rather than a bundled engine, so the
// SQLite file is opened by better-sqlite3 and handed to the client.
function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and set it (see README).",
    );
  }

  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

// Next.js recreates modules on every hot reload in development. Without this guard each
// reload would open another SQLite connection and eventually exhaust the file handles.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
