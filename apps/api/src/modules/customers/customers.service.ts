import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus, Role, CANCEL_REASONS } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail, defined, pageArgs, toPage, FieldErrors } from '../../common/utils/validate'
import { dateOnly, fmtStamp, PKT_TZ, US_TZ } from '../../common/utils/time'
import { assertSaleReviewer } from '../../common/utils/staff-policy'
import { VerticalsService } from '../verticals/verticals.service'

type Actor = { id: string; role: Role; managerType?: string | null }

const FINAL_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR]
const REVIEW_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR, Role.MANAGER]

export function clientSelect(role: Role) {
  const full = FINAL_ROLES.includes(role)
  return {
    select: {
      id: true, didCode: true, rateType: true, saleType: true,
      ...(full ? { companyName: true, rateOfSaleAmount: true } : {}),
    },
  } satisfies Prisma.Customer$clientArgs
}

const AGENT_SELECT = { select: { id: true, userCode: true, displayName: true } } satisfies Prisma.UserDefaultArgs

/** Snapshot fields are commercial data; managers and agents never receive them. */
function maskSnapshot<T extends Record<string, unknown>>(row: T, role: Role): T {
  if (FINAL_ROLES.includes(role)) return row
  const { saleCompanyName, saleRateAmount, saleRateType, ...rest } = row
  return rest as T
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService, private verticals: VerticalsService) {}

  private include(role: Role) {
    return { client: clientSelect(role), agent: AGENT_SELECT } satisfies Prisma.CustomerInclude
  }

  async findAll(actor: Actor, q: Record<string, string | undefined>) {
    const where: Prisma.CustomerWhereInput = actor.role === Role.AGENT ? { agentId: actor.id } : {}
    const status = q.status?.toUpperCase()
    if (status && status in CustomerStatus) where.status = status as CustomerStatus
    // Both open queues at once: waiting on a manager or waiting on final approval
    else if (status === 'AWAITING') where.status = { in: [CustomerStatus.PENDING, CustomerStatus.APPROVED] }
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ firstName: s }, { lastName: s }, { phone: s }]
    }
    const { skip, take, page } = pageArgs(q.page, 20)
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, include: this.include(actor.role), orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.customer.count({ where }),
    ])
    return toPage(rows.map(r => maskSnapshot(r, actor.role)), total, page, 20)
  }

  async counts(actor: Actor) {
    const rows = await this.prisma.customer.groupBy({
      by: ['status'],
      where: actor.role === Role.AGENT ? { agentId: actor.id } : {},
      _count: { _all: true },
    })
    const out: Record<string, number> = Object.fromEntries(Object.values(CustomerStatus).map(s => [s, 0]))
    for (const r of rows) out[r.status] = r._count._all
    out.ALL = rows.reduce((s, r) => s + r._count._all, 0)
    return out
  }

  async create(actor: Actor, b: Record<string, any>) {
    if (actor.role !== Role.AGENT) throw new ForbiddenException('Only agents can submit sales.')

    const settings = await this.prisma.formFieldSetting.findMany({ where: { formType: 'sale', isVisible: true } })
    const label = (key: string, fallback: string) => settings.find(s => s.fieldKey === key)?.label ?? fallback
    const required = new Set(settings.filter(s => s.isRequired).map(s => s.fieldKey))
    required.add('first_name').add('last_name')
    const req = (key: string) => required.has(key)

    const E = new FieldErrors()
    const verticalType = E.run('vertical_type', () => V.str(b.verticalType, label('vertical_type', 'Vertical type'), { required: req('vertical_type'), max: 50 }))
    const data = {
      firstName:       E.run('first_name',       () => V.str(b.firstName, label('first_name', 'First name'), { required: true, max: 100 })),
      midName:         E.run('mid_name',         () => V.str(b.midName, label('mid_name', 'Middle name'), { required: req('mid_name'), max: 100 })),
      lastName:        E.run('last_name',        () => V.str(b.lastName, label('last_name', 'Last name'), { required: true, max: 100 })),
      age:             E.run('age',              () => V.int(b.age, label('age', 'Age'), { required: req('age'), min: 0, max: 130 })),
      dateOfBirth:     E.run('date_of_birth',    () => V.date(b.dateOfBirth, label('date_of_birth', 'Date of birth'), { required: req('date_of_birth') })),
      phone:           E.run('phone',            () => V.str(b.phone, label('phone', 'Phone'), { required: req('phone'), max: 30 })),
      address:         E.run('address',          () => V.str(b.address, label('address', 'Address'), { required: req('address') })),
      city:            E.run('city',             () => V.str(b.city, label('city', 'City'), { required: req('city'), max: 100 })),
      state:           E.run('state',            () => V.str(b.state, label('state', 'State'), { required: req('state'), max: 100 })),
      postalCode:      E.run('postal_code',      () => V.str(b.postalCode, label('postal_code', 'Postal code'), { required: req('postal_code'), max: 20 })),
      verticalType,
      verticalOther:   E.run('vertical_other',   () => V.str(b.verticalOther, 'Vertical other', { max: 255 })),
      didComments:     E.run('did_comments',     () => V.str(b.didComments, label('did_comments', 'Comments'), { required: req('did_comments') })),
      transferredFrom: E.run('transferred_from', () => V.str(b.transferredFrom, label('transferred_from', 'Transferred from'), { required: req('transferred_from'), max: 255 })),
      reason:          E.run('reason',           () => V.str(b.reason, label('reason', 'Reason'), { required: req('reason'), max: 50 })),
    }
    // The vertical must be one of the active verticals; only the "Other" vertical goes without a DID
    const vertical = verticalType ? await this.verticals.find(verticalType) : null
    if (verticalType && (!vertical || !vertical.isActive)) E.add('vertical_type', 'Please choose one of the listed verticals.')
    const clientId = E.run('client_id', () => V.str(b.clientId, label('client_id', 'DID'), { required: !vertical?.isOther }))
    if (clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { isActive: true } })
      if (!client?.isActive) E.add('client_id', 'The selected DID is invalid.')
    }
    const extra = E.run('extra_fields', () => V.obj(b.extraFields, 'Extra fields'))
    E.throwIfAny()

    const now = new Date()
    const seq = await this.prisma.sequenceCounter.upsert({
      where:  { key: 'customerCode' },
      update: { value: { increment: 1 } },
      create: { key: 'customerCode', value: 1 },
    })

    const customer = await this.prisma.customer.create({
      data: {
        ...(data as Omit<Prisma.CustomerUncheckedCreateInput, 'agentId'>),
        firstName:      data.firstName!,
        lastName:       data.lastName!,
        dateOfBirth:    data.dateOfBirth ? dateOnly(data.dateOfBirth) : null,
        customerCode:   `C${String(seq.value).padStart(7, '0')}`,
        agentId:        actor.id,
        clientId:       clientId ?? null,
        status:         data.reason ? CustomerStatus.AGENT_REJECTED : CustomerStatus.PENDING,
        submittedAtPak: fmtStamp(now, PKT_TZ, 'PKT'),
        submittedAtEst: fmtStamp(now, US_TZ, 'EST'),
        extraFields:    extra && Object.keys(extra).length ? (extra as Prisma.InputJsonValue) : undefined,
      },
      include: { client: { select: { id: true, didCode: true } } },
    })
    return { customer }
  }

  private async load(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, include: { client: true } })
    if (!c) throw new NotFoundException('Customer not found.')
    return c
  }

  private async respond(id: string, role: Role) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id }, include: this.include(role) })
    return { customer: maskSnapshot(customer, role) }
  }

  async update(actor: Actor, id: string, b: Record<string, any>) {
    if (!REVIEW_ROLES.includes(actor.role)) throw new ForbiddenException('Forbidden.')
    await this.load(id)
    const clientId = V.str(b.clientId, 'DID')
    if (clientId && !(await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) fail('The selected DID is invalid.')
    const dob = V.date(b.dateOfBirth, 'Date of birth')
    // An edited sale may keep a vertical that has since been turned off, but it must exist
    const verticalType = V.str(b.verticalType, 'Vertical type', { max: 50 })
    if (verticalType && !(await this.verticals.find(verticalType))) fail('Please choose one of the listed verticals.')
    const data = defined({
      firstName:       V.str(b.firstName, 'First name', { max: 100 }) ?? undefined,
      midName:         V.str(b.midName, 'Middle name', { max: 100 }),
      lastName:        V.str(b.lastName, 'Last name', { max: 100 }) ?? undefined,
      dateOfBirth:     dob === undefined ? undefined : dob === null ? null : dateOnly(dob),
      phone:           V.str(b.phone, 'Phone', { max: 30 }),
      address:         V.str(b.address, 'Address'),
      city:            V.str(b.city, 'City', { max: 100 }),
      state:           V.str(b.state, 'State', { max: 100 }),
      postalCode:      V.str(b.postalCode, 'Postal code', { max: 20 }),
      verticalType:    verticalType,
      verticalOther:   V.str(b.verticalOther, 'Vertical other', { max: 255 }),
      clientId,
      didComments:     V.str(b.didComments, 'Comments'),
      transferredFrom: V.str(b.transferredFrom, 'Transferred from', { max: 255 }),
      verifiersPart:   V.str(b.verifiersPart, 'Verifiers part', { max: 255 }),
      leadIdTimestamp: V.str(b.leadIdTimestamp, 'Lead ID timestamp', { max: 255 }),
      reason:          V.str(b.reason, 'Reason', { max: 50 }),
    })
    await this.prisma.customer.update({ where: { id }, data: data as Prisma.CustomerUncheckedUpdateInput })
    return this.respond(id, actor.role)
  }

  async approve(actor: Actor, id: string, b: Record<string, any>) {
    assertSaleReviewer(actor)
    const c = await this.load(id)
    if (c.status !== CustomerStatus.PENDING) fail('Only pending customers can be approved.')
    const qaComments = V.str(b.qaComments, 'QA comments', { max: 2000 }) ?? null  // optional
    await this.prisma.customer.update({
      where: { id },
      data:  { status: CustomerStatus.APPROVED, managerId: actor.id, approvedAt: new Date(), qaComments },
    })
    return this.respond(id, actor.role)
  }

  async reject(actor: Actor, id: string, b: Record<string, any>) {
    assertSaleReviewer(actor)
    const c = await this.load(id)
    if (c.status !== CustomerStatus.PENDING) fail('Only pending customers can be rejected.')
    const reason      = V.oneOf(b.reason, 'Reason of cancellation', CANCEL_REASONS)
    const managerNote = V.str(b.managerNote, 'Manager note', { required: true, max: 255 })!
    const qaComments  = V.str(b.qaComments, 'QA comments', { max: 2000 }) ?? null  // optional
    await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.DISAPPROVED, managerId: actor.id, managerNote, qaComments,
        ...(reason ? { reason } : {}),
        disapprovedAt: new Date(),
        ...this.snapshot(c.client),
      },
    })
    return this.respond(id, actor.role)
  }

  async finalApprove(actor: Actor, id: string, b: Record<string, any>) {
    const c = await this.load(id)
    if (c.status !== CustomerStatus.APPROVED) fail('Customer must be manager-approved before final approval.')
    const variable = c.client?.rateType === 'variable'
    const entered = V.num(b.saleRateAmount, 'Rate amount', { required: variable, min: 0 })
    await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.FINAL_APPROVED, directorId: actor.id, finalApprovedAt: new Date(),
        ...this.snapshot(c.client),
        saleRateAmount: variable ? entered! : c.client?.rateOfSaleAmount ?? null,
      },
    })
    return this.respond(id, actor.role)
  }

  async finalReject(actor: Actor, id: string) {
    const c = await this.load(id)
    if (c.status !== CustomerStatus.APPROVED && c.status !== CustomerStatus.PENDING) fail('Cannot final-reject this record.')
    await this.prisma.customer.update({
      where: { id },
      data: {
        status: CustomerStatus.FINAL_DISAPPROVED, directorId: actor.id,
        reason: 'Rejected by Client', finalNote: 'Rejected by Client', finalDisapprovedAt: new Date(),
        ...this.snapshot(c.client),
      },
    })
    return this.respond(id, actor.role)
  }

  async remove(id: string) {
    await this.load(id)
    await this.prisma.customer.delete({ where: { id } })
    return { message: 'Record permanently deleted.' }
  }

  private snapshot(client: { didCode: string | null; companyName: string; rateOfSaleAmount: Prisma.Decimal | null; rateType: string } | null) {
    return {
      saleDidCode:     client?.didCode ?? null,
      saleCompanyName: client?.companyName ?? null,
      saleRateAmount:  client?.rateOfSaleAmount ?? null,
      saleRateType:    client?.rateType ?? null,
    }
  }
}
