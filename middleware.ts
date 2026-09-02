import { NextResponse, type NextRequest } from "next/server";

/**
 * One line per request on stdout, so `docker compose logs` shows traffic.
 * `next start` logs nothing itself — that only happens under `next dev`.
 *
 * Middleware runs before the route handler, so there is no status or duration
 * to report here: this is a record of what was asked for, not of the response.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  console.log(
    `[${new Date().toISOString()}] ${request.method} ${pathname}${search}`,
  );

  return NextResponse.next();
}

export const config = {
  // Every route this API serves: the CRUD endpoints and the healthcheck.
  matcher: ["/", "/health", "/api/:path*"],
};
