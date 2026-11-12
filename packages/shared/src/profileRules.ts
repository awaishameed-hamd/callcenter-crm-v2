// Rules for staff profile fields, shared by the API (which enforces them on save) and the web
// (which corrects and checks as people type), so both always agree. Written without newer
// String/Array methods because this package compiles for an older JS target.

/** "AWAIS  ali" -> "Awais Ali": every word starts with a capital, the rest is small. */
export function properCase(value?: string | null): string {
  const words = (value || '').replace(/\s+/g, ' ').replace(/^ | $/g, '').split(' ')
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w) out.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  }
  return out.join(' ')
}

/** Display name is a single name: letters only, no spaces or dashes. */
export const SINGLE_NAME_RE = /^[A-Za-z]+$/

/** "+92 300-1234567" -> "03001234567". Anything else is returned with only its digits. */
export function normalizePhone(value?: string | null): string {
  let d = (value || '').replace(/\D/g, '')
  if (d.length === 12 && d.slice(0, 2) === '92') d = '0' + d.slice(2)
  return d
}
/** Pakistani mobile number: exactly 11 digits, e.g. 03001234567. */
export const PHONE_RE = /^\d{11}$/

/** 13 digits -> "00000-0000000-0" */
export function formatCnic(value?: string | null): string {
  const d = (value || '').replace(/\D/g, '').slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return d.slice(0, 5) + '-' + d.slice(5)
  return d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12)
}
export const CNIC_RE = /^\d{5}-\d{7}-\d$/

/** Years of experience as a number, decimals allowed: "1.5". "2 years" -> "2". */
export function normalizeExperience(value?: string | null): string {
  const m = /^\s*(\d{1,2}(?:\.\d{1,2})?)\s*(years?|yrs?)?\s*$/i.exec(value || '')
  return m ? String(Number(m[1])) : (value || '').replace(/^\s+|\s+$/g, '')
}
export const EXPERIENCE_RE = /^\d{1,2}(\.\d{1,2})?$/

/** "pk36 scbl 0000 0011 2345 6702" -> "PK36SCBL0000001123456702" */
export function normalizeIban(value?: string | null): string {
  return (value || '').replace(/\s+/g, '').toUpperCase()
}
/** Pakistani IBAN: PK + 2 check digits + 4 bank letters + 16 digits (24 characters), check digits valid. */
export function isValidIban(value?: string | null): boolean {
  const s = normalizeIban(value)
  if (!/^PK\d{2}[A-Z]{4}\d{16}$/.test(s)) return false
  const r = s.slice(4) + s.slice(0, 4)
  let m = 0
  for (let i = 0; i < r.length; i++) {
    const c = r.charCodeAt(i)
    const v = c >= 65 && c <= 90 ? String(c - 55) : r.charAt(i)
    for (let j = 0; j < v.length; j++) m = (m * 10 + (v.charCodeAt(j) - 48)) % 97
  }
  return m === 1
}

/** name@domain.tld, no spaces, no doubled dots */
export function isValidEmailFormat(value?: string | null): boolean {
  const s = value || ''
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s) && s.indexOf('..') < 0
}

/** Messages shown for each rule, the same on screen and from the server. */
export const PROFILE_RULE_MESSAGES = {
  displayName: 'Display name must be one name only, with no spaces or dashes (e.g. Awais).',
  phone:       'Phone must be exactly 11 digits (e.g. 03001234567).',
  cnic:        'CNIC must be 13 digits in the format 00000-0000000-0.',
  experience:  'Experience must be a number of years (e.g. 2 or 1.5).',
  iban:        'IBAN must be a valid Pakistani IBAN: 24 characters starting with PK (e.g. PK36SCBL0000001123456702).',
  email:       'Enter a valid email address (e.g. name@gmail.com).',
  emailDomain: 'This email address cannot receive mail. Check the spelling of the part after @.',
}
