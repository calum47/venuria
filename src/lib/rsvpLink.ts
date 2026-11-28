/**
 * The public RSVP link: /rsvp/<token>. Pure helpers (no imports), so they run in the browser, on the server and in
 * plain node tests.
 *
 * A token is "<names>-<dd-mm-yyyy>-<code>", for example "chloe-luke-21-05-2027-k7m2q9xd": the couple's names and the
 * wedding date so a guest can see it is the right wedding, then 8 random characters, which are the only secret.
 * 8 characters from a 31-letter alphabet are about 8.5e11 combinations (40 bits). The readable part is NOT secret:
 * anyone who knows the names and the date still has to guess the code.
 *
 * Links made before this format are 64 hex characters and keep working: both shapes pass `isPlausibleToken`.
 */

/** No 0/o, 1/l/i, so a code read aloud or typed from a screenshot is not mistaken. 31 characters. */
const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const RSVP_CODE_LENGTH = 8
const NAMES_MAX = 40

/** Words that join two names and say nothing on their own ("Maria y Jose", "Anna & Tom", "Claire et Luc"). */
const JOINERS = new Set(['y', 'and', 'et'])

/** "María  García-López (test)" → "maria-garcia-lopez". Lowercase ASCII words joined by "-". */
export function slugWords(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .replace(/\([^)]*\)/g, ' ') // "(Test)" and similar notes are not part of the names
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
}

/** Names as words: joiners dropped, then as many whole words as fit in `max` characters. */
function namesSlug(text: string | null | undefined, max: number): string {
  const words = slugWords(text).filter((w) => !JOINERS.has(w))
  let out = ''
  for (const w of words) {
    const next = out ? `${out}-${w}` : w
    if (next.length > max) break
    out = next
  }
  // A single very long word is cut rather than dropped.
  return out || (words[0] ?? '').slice(0, max)
}

/** "2027-05-21" → "21-05-2027"; anything else → "". */
export function dateSlug(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/** `length` characters of the alphabet from Web Crypto (browser or node), without modulo bias. */
export function randomCode(length = RSVP_CODE_LENGTH): string {
  const n = CODE_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < length) {
    const buf = new Uint8Array(length * 2)
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b < limit && out.length < length) out += CODE_ALPHABET[b % n]
    }
  }
  return out
}

export type RsvpLinkSeed = {
  coupleNames?: string | null
  venueName?: string | null
  /** ISO date, "2027-05-21". */
  eventDate?: string | null
}

/** A fresh token for a project: names (or the venue's name, or "event"), the date if there is one, and a random code. */
export function newReadableToken(seed: RsvpLinkSeed, code: string = randomCode()): string {
  const names = namesSlug(seed.coupleNames, NAMES_MAX) || namesSlug(seed.venueName, NAMES_MAX) || 'event'
  return [names, dateSlug(seed.eventDate), code].filter(Boolean).join('-')
}

/**
 * Shape check before the database is touched: lowercase letters, digits and single hyphens, 12 to 100 characters.
 * Covers both the new readable tokens and the older 64-hex ones.
 */
export function isPlausibleToken(t: unknown): t is string {
  return typeof t === 'string' && t.length >= 12 && t.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t)
}
