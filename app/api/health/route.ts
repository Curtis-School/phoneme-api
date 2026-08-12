export async function GET() {
  return Response.json({
    status: "ok",
    service: "phoneme-api",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
}
