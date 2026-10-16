import { ForbiddenException } from '@nestjs/common'
import { Role, ManagerType } from '@crm/shared'

/**
 * Call-center access rules for the attendance, working-day and leave modules.
 * The modules come from argroup, but who may manage whom follows the call center's own roles:
 *   Admin, Director and the HR Manager form the HR desk and manage every staff member;
 *   Floor Managers / Team Leads and QA Managers manage agents only;
 *   Accountants and agents manage nobody.
 */
export type Actor = { id: string; role: Role | string; managerType?: string | null }

export const isHrManager  = (a: Actor) => a.role === Role.MANAGER && a.managerType === ManagerType.HR
export const isAccountant = (a: Actor) => a.role === Role.MANAGER && a.managerType === ManagerType.ACCOUNTANT

/** Admin, Director and HR Manager: working days, attendance settings, opening balances, all staff. */
export const hasHrDesk = (a: Actor) => a.role === Role.ADMIN || a.role === Role.DIRECTOR || isHrManager(a)

/** Roles whose attendance and leave the actor may review, approve and edit. */
export function manageableRoles(a: Actor): Role[] {
  if (a.role === Role.ADMIN) return [Role.DIRECTOR, Role.MANAGER, Role.AGENT]
  if (hasHrDesk(a))          return [Role.MANAGER, Role.AGENT]
  if (a.role === Role.MANAGER && !isAccountant(a)) return [Role.AGENT]
  return []
}

export function assertHrDesk(a: Actor) {
  if (!hasHrDesk(a)) throw new ForbiddenException('Only Admin, Director or the HR Manager can do this.')
}

export function assertReviewer(a: Actor) {
  if (manageableRoles(a).length === 0) throw new ForbiddenException('You do not manage any staff attendance.')
}

/** Nobody approves or edits their own records, and only staff in the actor's scope. */
export function assertCanManage(a: Actor, target: { id: string; role: Role | string }) {
  if (target.id === a.id) throw new ForbiddenException('You cannot approve or edit your own record.')
  if (!manageableRoles(a).includes(target.role as Role)) {
    throw new ForbiddenException('This staff member is outside your team.')
  }
}
