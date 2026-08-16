import { prisma } from "@/lib/prisma";

/**
 * Liveness + readiness check. Reports 200 only when the database also answers, so a
 * container that booted but cannot reach its SQLite volume is reported as unhealthy
 * rather than silently accepting traffic.
 */
export async function GET() {
  const base = {
    service: "phoneme-api",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  };

  try {
    // Cheapest round trip that proves the connection is usable. The result is
    // deliberately discarded: the driver returns SQLite integers as BigInt, which
    // Response.json() cannot serialise.
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Health check failed to reach the database:", error);

    return Response.json(
      { ...base, status: "error", database: "unavailable" },
      { status: 503 },
    );
  }

  return Response.json({ ...base, status: "ok", database: "connected" });
}
