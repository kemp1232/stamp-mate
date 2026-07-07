import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// This is a cheap cookie-presence check for redirecting logged-out users.
// The real session (and role/business checks) is verified on the server in
// each protected layout/page via requireUser()/requireOwner() — never trust
// this middleware check alone.
export const config = {
  matcher: ["/dashboard/:path*", "/staff/:path*"],
};
