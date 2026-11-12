import { promises as dns } from 'dns'
import {
  properCase, SINGLE_NAME_RE, normalizePhone, PHONE_RE, formatCnic, CNIC_RE, normalizeExperience, EXPERIENCE_RE,
  normalizeIban, isValidIban, isValidEmailFormat, PROFILE_RULE_MESSAGES as MSG,
} from '@crm/shared'
import { V, fail } from './validate'

/** Leaves "not sent" (undefined) and "cleared" (null) alone; tidies a value that was given. */
const tidy = <T>(v: string | null | undefined, f: (s: string) => T) => (v === undefined || v === null ? v : f(v))

/**
 * The person fields of a staff profile, read the same way by My Team (create/edit) and by each
 * person's own Profile: names auto-corrected to "Awais Ali" case, display name one word, phone 11
 * digits, CNIC 00000-0000000-0, experience a number, IBAN a valid Pakistani IBAN, email well formed.
 * Values typed loosely but unambiguously ("+92 300 1234567", "2 years") are tidied, not refused.
 */
export function readPersonFields(b: Record<string, any>, creating: boolean) {
  const displayName = tidy(V.str(b.displayName, 'Display name', { required: creating, max: 100 }), properCase)
  if (displayName && !SINGLE_NAME_RE.test(displayName)) fail(MSG.displayName)
  const email = V.email(b.email, 'Email', { required: creating })   // sign-in and password reset use it
  if (email && !isValidEmailFormat(email)) fail(MSG.email)
  const phone = tidy(V.str(b.phone, 'Phone', { max: 30 }), normalizePhone)
  if (phone && !PHONE_RE.test(phone)) fail(MSG.phone)
  const cnic = tidy(V.str(b.cnic, 'CNIC', { max: 20 }), formatCnic)
  if (cnic && !CNIC_RE.test(cnic)) fail(MSG.cnic)
  const experience = tidy(V.str(b.experience, 'Experience', { max: 50 }), normalizeExperience)
  if (experience && !EXPERIENCE_RE.test(experience)) fail(MSG.experience)
  const ibanNo = tidy(V.str(b.ibanNo, 'IBAN', { max: 40 }), normalizeIban)
  if (ibanNo && !isValidIban(ibanNo)) fail(MSG.iban)
  return {
    displayName:  displayName ?? undefined,
    firstName:    tidy(V.str(b.firstName, 'First name', { required: creating, max: 100 }), properCase) ?? undefined,
    midName:      tidy(V.str(b.midName, 'Middle name', { max: 100 }), properCase),
    lastName:     tidy(V.str(b.lastName, 'Last name', { required: creating, max: 100 }), properCase) ?? undefined,
    fatherName:   tidy(V.str(b.fatherName, 'Father name', { max: 100 }), properCase),
    accountTitle: tidy(V.str(b.accountTitle, 'Account title', { max: 255 }), properCase),
    email, phone, cnic, experience, ibanNo,
  }
}

// ── Can the email's domain receive mail? (catches made-up domains such as "metavoice.com") ──

const mxCache = new Map<string, { ok: boolean; until: number }>()

/** True when the domain after @ has mail servers. A DNS outage never blocks a save. */
export async function emailReceivesMail(email: string): Promise<boolean> {
  if (process.env.EMAIL_DOMAIN_CHECK === 'off') return true   // local test runs use made-up domains
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  if (!domain) return false
  const hit = mxCache.get(domain)
  if (hit && hit.until > Date.now()) return hit.ok
  let ok = true, keep = 60_000
  try {
    const mx = await Promise.race([dns.resolveMx(domain), new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 4000))])
    ok = mx.some(m => !!m.exchange)
    keep = 6 * 3600_000
  } catch (e: any) {
    // No mail servers, or no such domain: not deliverable. Anything else (timeouts) lets it through.
    if (e?.code === 'ENODATA' || e?.code === 'ENOTFOUND') { ok = false; keep = 6 * 3600_000 }
  }
  mxCache.set(domain, { ok, until: Date.now() + keep })
  return ok
}

export async function assertEmailReceivesMail(email?: string | null) {
  if (email && !(await emailReceivesMail(email))) fail(MSG.emailDomain)
}

/** What on this profile breaks the rules (saved before they existed), for the Profile page's notice. */
export async function profileIssues(u: { displayName?: string | null; email?: string | null; phone?: string | null; cnic?: string | null; experience?: string | null; ibanNo?: string | null }) {
  const out: { field: string; message: string }[] = []
  if (u.displayName && !SINGLE_NAME_RE.test(properCase(u.displayName))) out.push({ field: 'display_name', message: MSG.displayName })
  if (!u.email || !isValidEmailFormat(u.email)) out.push({ field: 'email', message: MSG.email })
  else if (!(await emailReceivesMail(u.email))) out.push({ field: 'email', message: MSG.emailDomain })
  if (u.phone && !PHONE_RE.test(normalizePhone(u.phone))) out.push({ field: 'phone', message: MSG.phone })
  if (u.cnic && !CNIC_RE.test(formatCnic(u.cnic))) out.push({ field: 'cnic', message: MSG.cnic })
  if (u.experience && !EXPERIENCE_RE.test(normalizeExperience(u.experience))) out.push({ field: 'experience', message: MSG.experience })
  if (u.ibanNo && !isValidIban(u.ibanNo)) out.push({ field: 'iban_no', message: MSG.iban })
  return out
}
