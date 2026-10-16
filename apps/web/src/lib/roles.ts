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
  const match = (list: string[]) => list.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (match(hrOnly) && !isHrManager(u)) return '/manager/dashboard'
  if (match(noHr) && isHrManager(u)) return '/manager/team'
  if (match(accountantOnly) && !isAccountant(u)) return isHrManager(u) ? '/manager/team' : '/manager/dashboard'
  return null
}
