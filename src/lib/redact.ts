/**
 * Redaction for free-text fields that ship to admins / dataset exports.
 *
 * Scope (forward-only): every NEW receipt's prompt_preview, response_preview,
 * and goal must pass through `redactPII` before insert. Existing rows are
 * untouched (they're test data).
 *
 * What we redact:
 *   - email addresses        → [email]
 *   - phone numbers          → [phone]   (US-ish 10+ digit runs, with separators)
 *   - URLs                   → [url]
 *   - long digit runs (≥9)   → [num]     (catches SSN/CC/etc. that slipped through)
 *
 * We deliberately do NOT try to redact names — false positives on rubric
 * vocabulary are worse than the (low) risk of a name appearing in a 500-char
 * preview. Use the admin "reveal" path if a real name is needed.
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;
// Phone: optional +, then country/area in parens or not, then 7+ digits with - . or spaces
const PHONE_RE = /(?<![A-Za-z0-9])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?)\d{3}[\s.-]?\d{3,4}(?![A-Za-z0-9])/g;
// Long digit run that wasn't already caught above (SSN, CC, account numbers)
const LONG_DIGITS_RE = /(?<![A-Za-z0-9])\d{9,}(?![A-Za-z0-9])/g;

export function redactPII(input: string | null | undefined): string | null {
  if (input == null) return null;
  let s = String(input);
  s = s.replace(EMAIL_RE, "[email]");
  s = s.replace(URL_RE, "[url]");
  s = s.replace(PHONE_RE, "[phone]");
  s = s.replace(LONG_DIGITS_RE, "[num]");
  return s;
}

/** Returns true if the string contained anything that was redacted. */
export function containedPII(input: string | null | undefined): boolean {
  if (!input) return false;
  return EMAIL_RE.test(input) || URL_RE.test(input) || PHONE_RE.test(input) || LONG_DIGITS_RE.test(input);
}
