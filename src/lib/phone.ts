/**
 * Normalizes a phone number for storage/lookup: strips everything but
 * digits, so the same customer matches regardless of formatting (spaces,
 * dashes, parens) *and* regardless of a leading `+` — a `+` is pure E.164
 * formatting with no identifying information of its own, so
 * "+639171234567" and "639171234567" now correctly collapse to the same
 * key ("639171234567").
 *
 * What this deliberately does NOT do: canonicalize a national trunk prefix
 * (PH's leading "0", e.g. "09171234567" vs "+639171234567" — the same
 * subscriber, but still two different digit strings after this function).
 * Doing that safely requires knowing the business's country, which isn't a
 * setting the app has yet — the join form's placeholder is a US-format
 * number, so hardcoding a PH "0" -> "+63" rule here would wrongly merge
 * unrelated customers in any non-PH business. Revisit once there's a
 * per-business country setting.
 */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/\D/g, "");
}
