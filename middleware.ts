import { NextResponse, type NextRequest } from "next/server";

/**
 * One line per request on stdout, so `docker compose logs` shows traffic.
 * Only logs what was asked for, not of the response.
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
