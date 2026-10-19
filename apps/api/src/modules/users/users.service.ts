import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { ManagerType, MANAGER_TYPES, AGENT_TYPES, DEPARTMENTS } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail, defined, pageArgs, toPage, csvRow } from '../../common/utils/validate'
import { dateOnly, fmtDateOnly } from '../../common/utils/time'

const HIERARCHY: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT]
const ROLE_PREFIX: Partial<Record<Role, string>> = { [Role.DIRECTOR]: 'D', [Role.MANAGER]: 'M', [Role.AGENT]: 'A' }
const CNIC_RE = /^\d{5}-\d{7}-\d{1}$/

export const USER_SELECT = {
  id: true, userCode: true, role: true, displayName: true,
  firstName: true, midName: true, lastName: true, fatherName: true,
  email: true, phone: true, dateOfBirth: true, dateOfJoining: true,
  department: true, agentType: true, managerType: true, experience: true,
  cnic: true, permanentAddress: true, currentAddress: true, address: true,
  bank: true, accountTitle: true, bankAccountNo: true, ibanNo: true,
  basicSalary: true, punctualityAllowance: true, travellingAllowance: true, otherAllowance: true,
  isActive: true, inactiveSince: true, profileLocked: true, attendanceApplicable: true,
  avatar: true, createdAt: true, extraFields: true,
} satisfies Prisma.UserSelect

type Actor = { id: string; role: Role }

export function rolesBelow(role: Role): Role[] {
  const i = HIERARCHY.indexOf(role)
  return i === -1 ? [] : HIERARCHY.slice(i + 1)
}

export function attendanceApplies(role: Role, managerType?: string | null) {
  return role === Role.AGENT || (role === Role.MANAGER && managerType !== ManagerType.ACCOUNTANT)
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async nextCode(role: string) {
    const prefix = ROLE_PREFIX[role as Role]
    if (!prefix) fail('Invalid role.')
    const users = await this.prisma.user.findMany({
      where: { role: role as Role, userCode: { startsWith: prefix } },
      select: { userCode: true },
    })
    const max = users.reduce((m, u) => Math.max(m, parseInt(u.userCode.slice(1), 10) || 0), 0)
    return { code: `${prefix}${String(max + 1).padStart(3, '0')}` }
  }

  private scopeRoles(actor: Actor): Role[] {
    if (actor.role === Role.ADMIN)    return HIERARCHY
    if (actor.role === Role.DIRECTOR) return [Role.DIRECTOR, Role.MANAGER, Role.AGENT]
    if (actor.role === Role.MANAGER)  return [Role.MANAGER, Role.AGENT]
    throw new ForbiddenException('Forbidden.')
  }

  private listWhere(actor: Actor, q: Record<string, string | undefined>): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { role: { in: this.scopeRoles(actor) } }
    if (q.role) where.role = q.role as Role
    if (q.role && !this.scopeRoles(actor).includes(q.role as Role)) where.role = { in: [] }
    const status = q.status ?? 'active'
    if (status === 'active')   where.isActive = true
    if (status === 'inactive') where.isActive = false
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ userCode: s }, { displayName: s }, { firstName: s }, { lastName: s }, { email: s }, { phone: s }]
    }
    return where
  }

  private sortByHierarchy<T extends { role: Role; userCode: string }>(rows: T[]): T[] {
    return rows.sort((a, b) => HIERARCHY.indexOf(a.role) - HIERARCHY.indexOf(b.role) || a.userCode.localeCompare(b.userCode, undefined, { numeric: true }))
  }

  async findAll(actor: Actor, q: Record<string, string | undefined>) {
    const where = this.listWhere(actor, q)
    const rows = this.sortByHierarchy(await this.prisma.user.findMany({ where, select: USER_SELECT }))
    if (q.format === 'csv') return this.exportCsv(rows)
    if (q.perPage === 'all') return rows
    const { skip, take, page } = pageArgs(q.page, 20)
    return toPage(rows.slice(skip, skip + take), rows.length, page, 20)
  }

  private exportCsv(users: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>[]) {
    const lines = [csvRow([
      'User ID', 'Role', 'Role Type', 'Display Name', 'Status', 'Inactive Since',
      'First Name', 'Middle Name', 'Last Name', 'Father Name', 'Email', 'Phone', 'Date of Birth', 'Date of Joining',
      'Department', 'Experience', 'CNIC', 'Permanent Address', 'Current Address',
      'Bank', 'Account Title', 'Account No.', 'IBAN No.',
      'Basic Salary', 'Punctuality Allowance', 'Travelling Allowance', 'Other Allowance', 'Total Package',
    ])]
    for (const u of users) {
      const total = [u.basicSalary, u.punctualityAllowance, u.travellingAllowance, u.otherAllowance]
        .reduce((s, v) => s + Number(v ?? 0), 0)
      lines.push(csvRow([
        u.userCode, u.role.charAt(0) + u.role.slice(1).toLowerCase(), u.agentType ?? u.managerType ?? '',
        u.displayName, u.isActive ? 'Active' : 'Inactive', fmtDateOnly(u.inactiveSince) ?? '',
        u.firstName, u.midName ?? '', u.lastName, u.fatherName ?? '', u.email ?? '', u.phone ?? '',
        fmtDateOnly(u.dateOfBirth) ?? '', fmtDateOnly(u.dateOfJoining) ?? '',
        u.department ?? '', u.experience ?? '', u.cnic ?? '', u.permanentAddress ?? '', u.currentAddress ?? '',
        u.bank ?? '', u.accountTitle ?? '', u.bankAccountNo ?? '', u.ibanNo ?? '',
        u.basicSalary ?? '', u.punctualityAllowance ?? '', u.travellingAllowance ?? '', u.otherAllowance ?? '',
        total > 0 ? total : '',
      ]))
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
    return { csv: lines.join('\n'), filename: `users_${stamp}.csv` }
  }

  /** Field readers shared by create and update. */
  private readProfile(b: Record<string, any>, creating: boolean) {
    const cnic = V.str(b.cnic, 'CNIC', { max: 15 })
    if (cnic && !CNIC_RE.test(cnic)) fail('CNIC must be in the format 00000-0000000-0.')
    const extra = V.obj(b.extraFields, 'Extra fields')
    return defined({
      displayName:          V.str(b.displayName, 'Display name', { required: creating, max: 255 }) ?? undefined,
      firstName:            V.str(b.firstName, 'First name', { required: creating, max: 100 }) ?? undefined,
      midName:              V.str(b.midName, 'Middle name', { max: 100 }),
      lastName:             V.str(b.lastName, 'Last name', { required: creating, max: 100 }) ?? undefined,
      fatherName:           V.str(b.fatherName, 'Father name', { max: 100 }),
      email:                V.email(b.email, 'Email', { required: creating }),  // sign-in and password reset use it
      phone:                V.str(b.phone, 'Phone', { max: 30 }),
      dateOfBirth:          this.toDate(V.date(b.dateOfBirth, 'Date of birth')),
      dateOfJoining:        this.toDate(V.date(b.dateOfJoining, 'Date of joining', { required: creating })),
      address:              V.str(b.address, 'Address'),
      cnic,
      permanentAddress:     V.str(b.permanentAddress, 'Permanent address'),
      currentAddress:       V.str(b.currentAddress, 'Current address'),
      experience:           V.str(b.experience, 'Experience', { max: 255 }),
      department:           V.oneOf(b.department, 'Department', DEPARTMENTS),
      agentType:            V.oneOf(b.agentType, 'Agent type', AGENT_TYPES),
      managerType:          V.oneOf(b.managerType, 'Manager type', MANAGER_TYPES),
      bank:                 V.str(b.bank, 'Bank', { max: 255 }),
      accountTitle:         V.str(b.accountTitle, 'Account title', { max: 255 }),
      bankAccountNo:        V.str(b.bankAccountNo, 'Account number', { max: 100 }),
      ibanNo:               V.str(b.ibanNo, 'IBAN', { max: 100 }),
      basicSalary:          V.num(b.basicSalary, 'Basic salary', { min: 0 }),
      punctualityAllowance: V.num(b.punctualityAllowance, 'Punctuality allowance', { min: 0 }),
      travellingAllowance:  V.num(b.travellingAllowance, 'Travelling allowance', { min: 0 }),
      otherAllowance:       V.num(b.otherAllowance, 'Other allowance', { min: 0 }),
      extraFields:          extra === null ? Prisma.DbNull : (extra as Prisma.InputJsonValue | undefined),
    })
  }

  private toDate(s: string | null | undefined) {
    return s === undefined ? undefined : s === null ? null : dateOnly(s)
  }

  private async assertUnique(userCode?: string, email?: string | null, ignoreId?: string) {
    if (userCode) {
      const u = await this.prisma.user.findUnique({ where: { userCode }, select: { id: true } })
      if (u && u.id !== ignoreId) fail('The username has already been taken.')
    }
    if (email) {
      const u = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (u && u.id !== ignoreId) fail('The email has already been taken.')
    }
  }

  async create(actor: Actor, b: Record<string, any>) {
    const allowed = rolesBelow(actor.role)
    if (!allowed.length) throw new ForbiddenException('You are not allowed to create users.')

    const role = V.oneOf(b.role, 'Role', allowed, { required: true }) as Role
    const password = V.str(b.password, 'Password', { required: true, min: 8 })!
    const userCode = (V.str(b.userCode, 'Username', { max: 100 }) ?? (await this.nextCode(role)).code).toUpperCase()
    const data = this.readProfile(b, true)
    await this.assertUnique(userCode, data.email as string | null | undefined)

    return this.prisma.user.create({
      data: {
        ...(data as Prisma.UserCreateInput),
        userCode,
        role,
        password: await bcrypt.hash(password, 12),
        createdBy: { connect: { id: actor.id } },
        attendanceApplicable: attendanceApplies(role, data.managerType as string | undefined),
      },
      select: USER_SELECT,
    })
  }

  private canEdit(actor: Actor, target: { role: Role }) {
    if (actor.role === Role.ADMIN)    return true
    if (actor.role === Role.DIRECTOR) return target.role === Role.MANAGER || target.role === Role.AGENT
    if (actor.role === Role.MANAGER)  return target.role === Role.AGENT
    return false
  }

  private canToggleActive(actor: Actor, target: { role: Role }) {
    if (actor.role === Role.ADMIN)    return true
    if (actor.role === Role.DIRECTOR) return target.role !== Role.ADMIN
    if (actor.role === Role.MANAGER)  return target.role === Role.AGENT
    return false
  }

  private async target(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, managerType: true, profileLocked: true } })
    if (!u) throw new NotFoundException('User not found.')
    return u
  }

  async update(actor: Actor, id: string, b: Record<string, any>) {
    const user = await this.target(id)
    if (!this.canEdit(actor, user)) throw new ForbiddenException('Forbidden.')

    let role: Role | undefined
    if (b.role !== undefined && b.role !== user.role) {
      if (user.id === actor.id) fail('You cannot change your own role.')
      role = V.oneOf(b.role, 'Role', rolesBelow(actor.role), { required: true }) as Role
    }

    const userCode = V.str(b.userCode, 'Username', { max: 100 })?.toUpperCase()
    const password = V.str(b.password, 'Password', { min: 8 })
    const data = this.readProfile(b, false)
    await this.assertUnique(userCode, data.email as string | null | undefined, id)

    const nextRole = role ?? user.role
    const nextManagerType = data.managerType !== undefined ? (data.managerType as string | null) : user.managerType

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data as Prisma.UserUpdateInput),
        ...(userCode ? { userCode } : {}),
        ...(role ? { role } : {}),
        ...(password ? { password: await bcrypt.hash(password, 12) } : {}),
        ...(role || data.managerType !== undefined ? { attendanceApplicable: attendanceApplies(nextRole, nextManagerType) } : {}),
      },
      select: USER_SELECT,
    })
  }

  async deactivate(actor: Actor, id: string, inactiveSince: unknown) {
    const user = await this.target(id)
    if (!this.canToggleActive(actor, user)) throw new ForbiddenException('Forbidden.')
    if (user.id === actor.id) fail('You cannot deactivate your own account.')
    const since = V.date(inactiveSince, 'Inactive since', { required: true })!
    await this.prisma.user.update({ where: { id }, data: { isActive: false, inactiveSince: dateOnly(since) } })
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } })
    return { message: 'User disabled.' }
  }

  /**
   * Permanent delete (argroup's rule): only someone you could create, never yourself, and never a
   * user whose sales are on record; disable those instead so the Sales Report keeps the agent.
   */
  async deletePermanently(actor: Actor, id: string) {
    if (id === actor.id) fail('You cannot delete your own account.')
    const user = await this.prisma.user.findUnique({
      where: { id }, select: { id: true, role: true, displayName: true, _count: { select: { submittedSales: true } } },
    })
    if (!user) throw new NotFoundException('User not found.')
    if (!this.canEdit(actor, user)) throw new ForbiddenException('You do not have permission to delete this user.')
    const sales = user._count.submittedSales
    if (sales > 0) fail(`${user.displayName} has ${sales} sale${sales === 1 ? '' : 's'} on record. Disable the account instead, so the Sales Report keeps them.`)

    await this.prisma.$transaction(async tx => {
      // Chat messages are tied to their sender and are not work, so they go
      await tx.message.deleteMany({ where: { senderId: id } })
      // Their own leave requests go with them; invoices they created pass to whoever deletes them
      await tx.leaveApplication.deleteMany({ where: { applicantId: id } })
      await tx.invoice.updateMany({ where: { createdById: id }, data: { createdById: actor.id } })
      // The rest releases itself: sale approvals, leave reviews, attendance edits and vouchers keep
      // their record with the name cleared; attendance, notifications, sessions and chat memberships go
      await tx.user.delete({ where: { id } })
    })
    return { message: 'User deleted permanently.' }
  }

  async activate(actor: Actor, id: string) {
    const user = await this.target(id)
    if (!this.canToggleActive(actor, user)) throw new ForbiddenException('Forbidden.')
    await this.prisma.user.update({ where: { id }, data: { isActive: true, inactiveSince: null } })
    return { message: 'User re-activated.' }
  }

  async toggleLock(actor: Actor, id: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Forbidden.')
    const user = await this.target(id)
    const updated = await this.prisma.user.update({ where: { id }, data: { profileLocked: !user.profileLocked }, select: { profileLocked: true } })
    return { profileLocked: updated.profileLocked }
  }

  async updateRole(actor: Actor, id: string, role: unknown) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Admin only.')
    const next = V.oneOf(role, 'Role', HIERARCHY, { required: true }) as Role
    const user = await this.target(id)
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: next, attendanceApplicable: attendanceApplies(next, user.managerType) },
      select: USER_SELECT,
    })
    return { message: 'Role updated.', user: updated }
  }

  agentsDropdown() {
    return this.prisma.user.findMany({
      where:   { role: Role.AGENT },
      select:  { id: true, displayName: true, userCode: true, isActive: true },
      orderBy: { userCode: 'asc' },
    })
  }
}
