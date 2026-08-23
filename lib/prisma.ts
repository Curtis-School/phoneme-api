import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/lib/generated/prisma/client";

type Client = PrismaClient;

// Prisma 7 connects through a driver adapter rather than a bundled engine, so the
// SQLite file is opened by better-sqlite3 and handed to the client.
function createPrismaClient(): Client {
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
const globalForPrisma = globalThis as unknown as { prisma?: Client };

function getClient(): Client {
  const existing = globalForPrisma.prisma;

  if (existing) {
    return existing;
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = new Proxy({} as Client, {
  get(_target, property) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[property];

    return typeof value === "function" ? value.bind(client) : value;
  },
});
