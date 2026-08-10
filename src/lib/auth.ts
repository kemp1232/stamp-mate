import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Cookie cache is deliberately OFF. With it on, a signed session cookie
  // keeps authenticating for up to `maxAge` after the DB session row is
  // revoked/expired — e.g. offboarding staff or a stolen-device logout
  // would still let stamps be added and rewards redeemed for that window.
  // This app is small-scale enough that the extra per-request DB lookup
  // (one indexed query) is worth trading away for revocation taking effect
  // immediately, since staff actions here are security-sensitive.
  session: {
    cookieCache: {
      enabled: false,
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  // Must stay last: lets server actions/route handlers set session cookies
  // via next/headers instead of returning a raw Response.
  plugins: [nextCookies()],
});
