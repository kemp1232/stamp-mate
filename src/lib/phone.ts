/**
 * Normalizes a phone number for storage/lookup: keeps digits and a leading
 * `+` only, so the same customer matches regardless of formatting
 * (spaces, dashes, parens).
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digits}` : digits;
}
