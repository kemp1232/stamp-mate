import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getAppUrl } from "@/lib/url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// A malformed BETTER_AUTH_URL (e.g. missing its scheme) would otherwise
// throw here at module scope, taking down every route — the root layout
// has no error.tsx to catch it, only the unstyled global-error fallback.
// Fall back to the same localhost default getAppUrl() itself uses.
function resolveMetadataBase(): URL {
  try {
    return new URL(getAppUrl());
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "StampMate",
  description: "QR-based customer loyalty stamp cards for small businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased animate-in fade-in duration-150`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
