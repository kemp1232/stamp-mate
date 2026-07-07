/**
 * Pulls a card token out of either a full scanned/pasted URL
 * (`/staff/cards/[token]` or `/card/[token]`) or a raw token string.
 * Used by both the QR scanner and the manual-entry fallback.
 */
export function extractCardToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const match =
      url.pathname.match(/\/staff\/cards\/([^/]+)/) ??
      url.pathname.match(/\/card\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    // Not a URL — accept it as a raw token if it's plausibly one.
    return /^[A-Za-z0-9_-]{8,}$/.test(trimmed) ? trimmed : null;
  }
}
