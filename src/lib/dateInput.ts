import { isIsoDate } from '@/lib/projectDates'

/** '2027-05-21' → '21/05/2027'. Anything that is not a valid ISO date → ''. */
export function isoToDisplay(iso: string): string {
  if (!isIsoDate(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/**
 * What a person types → ISO date, or '' when it is not a complete, real date.
 * Day first (Spanish order): 21/05/2027, 1/5/2027, 21-05-2027 and 21.05.2027 all work.
 * A two-digit year is NOT guessed (is "27" 2027 or 1927?) — it is rejected.
 */
export function displayToIso(text: string): string {
  const m = /^\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\s*$/.exec(text)
  if (!m) return ''
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isIsoDate(iso) ? iso : ''
}
