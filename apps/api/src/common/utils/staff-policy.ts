import { ForbiddenException } from '@nestjs/common'
import { Role, ManagerType } from '@crm/shared'

/**
 * Call-center access rules for the attendance, working-day and leave modules.
 * The modules come from argroup, but who may manage whom follows the Laravel call-center CRM:
 *   Attendance (report, daily view, approval, edits, working days, settings) is the HR desk's job:
 *     Admin, Director and the HR Manager, over every staff member.
 *   Leave approval also belongs to Floor Managers / Team Leads and QA Managers, for agents only.
 *   Accountants and agents manage nobody, and nobody approves or edits their own records.
 */
export type Actor = { id: string; role: Role | string; managerType?: string | null }

export const isHrManager  = (a: Actor) => a.role === Role.MANAGER && a.managerType === ManagerType.HR
export const isAccountant = (a: Actor) => a.role === Role.MANAGER && a.managerType === ManagerType.ACCOUNTANT

/** Admin, Director and HR Manager. */
export const hasHrDesk = (a: Actor) => a.role === Role.ADMIN || a.role === Role.DIRECTOR || isHrManager(a)

/** Roles whose attendance the actor may review, approve and edit. */
export function attendanceRoles(a: Actor): Role[] {
  if (a.role === Role.ADMIN) return [Role.DIRECTOR, Role.MANAGER, Role.AGENT]
  return hasHrDesk(a) ? [Role.MANAGER, Role.AGENT] : []
}

/** Roles whose leave applications the actor may approve or reject. */
export function leaveRoles(a: Actor): Role[] {
  if (hasHrDesk(a)) return attendanceRoles(a)
  return a.role === Role.MANAGER && !isAccountant(a) ? [Role.AGENT] : []
}

export function assertHrDesk(a: Actor) {
  if (!hasHrDesk(a)) throw new ForbiddenException('Only Admin, Director or the HR Manager can do this.')
}

/** Nobody approves or edits their own records, and only staff within the given roles. */
export function assertCanManage(a: Actor, target: { id: string; role: Role | string }, roles: Role[]) {
  if (target.id === a.id) throw new ForbiddenException('You cannot approve or edit your own record.')
  if (!roles.includes(target.role as Role)) throw new ForbiddenException('This staff member is outside your team.')
}
