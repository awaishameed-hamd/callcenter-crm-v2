import { Role, ManagerType } from '@crm/shared'

type U = { role: Role | string; managerType?: string | null } | null | undefined

export const isHrManager    = (u: U) => u?.role === Role.MANAGER && u?.managerType === ManagerType.HR
export const isAccountant   = (u: U) => u?.role === Role.MANAGER && u?.managerType === ManagerType.ACCOUNTANT
export const isFinalApprover = (u: U) => u?.role === Role.ADMIN || u?.role === Role.DIRECTOR

export const roleBase = (u: U) => `/${String(u?.role ?? '').toLowerCase()}`

/** Landing page after login: HR managers start on their team, everyone else on the dashboard. */
export function roleHome(u: U) {
  if (!u) return '/login'
  return isHrManager(u) ? '/manager/team' : `${roleBase(u)}/dashboard`
}

export const ROLE_NAME: Record<string, string> = { ADMIN: 'Admin', DIRECTOR: 'Director', MANAGER: 'Manager', AGENT: 'Agent' }

/** Call-center role with its manager or agent type, e.g. "Manager (HR Manager)", "Agent (Closer)". */
export function staffRole(role?: string | null, type?: string | null) {
  const name = ROLE_NAME[String(role ?? '')] ?? String(role ?? '')
  return type ? `${name} (${type})` : name
}

const ROLE_PILL: Record<string, { bg: string; color: string }> = {
  ADMIN: { bg: '#EDE9FE', color: '#6D28D9' }, DIRECTOR: { bg: '#DBEAFE', color: '#1D4ED8' },
  MANAGER: { bg: '#E0E7FF', color: '#4338CA' }, AGENT: { bg: '#CFFAFE', color: '#0E7490' },
}
export const rolePill = (role?: string | null) => ROLE_PILL[String(role ?? '')] ?? { bg: '#F3F4F6', color: '#374151' }

// Same rules as the API's staff-policy: Admin, Director and the HR Manager run the HR desk for all staff,
// Floor/QA managers look after agents, Accountants and agents manage nobody.
type Actor = { id?: string; role: Role | string; managerType?: string | null } | null | undefined
export const hasHrDesk = (u: Actor) => u?.role === Role.ADMIN || u?.role === Role.DIRECTOR || isHrManager(u)
export function manageableRoles(u: Actor): string[] {
  if (u?.role === Role.ADMIN) return [Role.DIRECTOR, Role.MANAGER, Role.AGENT]
  if (hasHrDesk(u)) return [Role.MANAGER, Role.AGENT]
  if (u?.role === Role.MANAGER && !isAccountant(u)) return [Role.AGENT]
  return []
}
export const canManage = (u: Actor, target: { id?: string; role?: string | null }) =>
  !!u && target.id !== u.id && manageableRoles(u).includes(String(target.role))

export function roleLabel(u: U) {
  if (!u) return ''
  if (isHrManager(u)) return 'HR Manager'
  if (isAccountant(u)) return 'Accountant'
  return ({ ADMIN: 'Administrator', DIRECTOR: 'Director', MANAGER: 'Manager', AGENT: 'Sales Agent' } as Record<string, string>)[String(u.role)] ?? String(u.role)
}

/** Manager sub-type restrictions carried over from the Laravel routes. */
export function managerRedirect(u: U, pathname: string): string | null {
  if (u?.role !== Role.MANAGER) return null
  const hrOnly = ['/manager/attendance/working-days']
  const noHr   = ['/manager/dashboard', '/manager/approvals', '/manager/reports']
  const accountantOnly = ['/manager/accounting']
  // Accountants have no attendance, leave or sale-approval duties in the call center.
  const notAccountant = ['/manager/attendance', '/manager/leaves', '/manager/approvals']
  const match = (list: string[]) => list.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (match(notAccountant) && isAccountant(u)) return '/manager/dashboard'
  if (match(hrOnly) && !isHrManager(u)) return '/manager/dashboard'
  if (match(noHr) && isHrManager(u)) return '/manager/team'
  if (match(accountantOnly) && !isAccountant(u)) return isHrManager(u) ? '/manager/team' : '/manager/dashboard'
  return null
}
