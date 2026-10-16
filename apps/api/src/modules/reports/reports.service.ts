import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CustomerStatus, Role } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { clientSelect } from '../customers/customers.service'
import { V, pageArgs, toPage, csvRow } from '../../common/utils/validate'
import { BUSINESS_TZ, dayRangeUtc, fmtDateOnly, todayIn } from '../../common/utils/time'

type Actor = { id: string; role: Role }

const FINAL_ROLES: Role[] = [Role.ADMIN, Role.DIRECTOR]
const FROZEN: CustomerStatus[] = [CustomerStatus.FINAL_APPROVED, CustomerStatus.DISAPPROVED, CustomerStatus.FINAL_DISAPPROVED]

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private where(actor: Actor, q: Record<string, string | undefined>): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = actor.role === Role.AGENT ? { agentId: actor.id } : {}
    const from = V.date(q.dateFrom, 'Date from') ?? undefined
    const to   = V.date(q.dateTo, 'Date to') ?? undefined
    if (from || to) {
      const range = dayRangeUtc(from ?? '2000-01-01', to ?? todayIn(BUSINESS_TZ), BUSINESS_TZ)
      where.createdAt = from && to ? range : from ? { gte: range.gte } : { lt: range.lt }
    }
    const status = q.status?.toUpperCase()
    if (status && status in CustomerStatus) where.status = status as CustomerStatus
    if (q.agentId && actor.role !== Role.AGENT) where.agentId = q.agentId
    if (q.clientId) where.clientId = q.clientId
    if (q.companyName && FINAL_ROLES.includes(actor.role)) where.client = { companyName: q.companyName }
    if (q.verticalType) where.verticalType = q.verticalType
    return where
  }

  private include(role: Role) {
    return {
      agent:  { select: { id: true, userCode: true, displayName: true } },
      client: clientSelect(role),
    } satisfies Prisma.CustomerInclude
  }

  private mask<T extends Record<string, unknown>>(row: T, role: Role): T {
    if (FINAL_ROLES.includes(role)) return row
    const { saleCompanyName, saleRateAmount, saleRateType, ...rest } = row
    return rest as T
  }

  async list(actor: Actor, q: Record<string, string | undefined>) {
    const where = this.where(actor, q)
    const { skip, take, page } = pageArgs(q.page, 20)
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({ where, include: this.include(actor.role), orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.customer.count({ where }),
    ])
    return toPage(rows.map(r => this.mask(r, actor.role)), total, page, 20)
  }

  async exportCsv(actor: Actor, q: Record<string, string | undefined>): Promise<string> {
    const showCommercial = FINAL_ROLES.includes(actor.role)
    const rows = await this.prisma.customer.findMany({
      where: this.where(actor, q),
      include: {
        agent:  { select: { displayName: true } },
        client: { select: { didCode: true, companyName: true, rateOfSaleAmount: true, rateType: true, saleType: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const header = [
      'Code', 'Agent', 'First Name', 'Mid Name', 'Last Name',
      'Age', 'CX DOB', 'Phone', 'Address', 'City', 'State', 'ZIP',
      'Vertical', 'Vertical Other', 'Comments', 'Transferred From', 'QA Comments',
      'Reason', 'Rejection Reason', 'DID Code', 'Sale Type',
      ...(showCommercial ? ['Company', 'Rate', 'Rate Type'] : []),
      'Status', 'Pak Time (PKT)', 'USA Time (EST)', 'Date Submitted',
    ]
    const lines = [csvRow(header)]
    for (const c of rows) {
      const frozen = FROZEN.includes(c.status as CustomerStatus)
      const did     = frozen && c.saleDidCode ? c.saleDidCode : c.client?.didCode
      const company = frozen && c.saleCompanyName ? c.saleCompanyName : c.client?.companyName
      const rate    = frozen && c.saleRateType ? c.saleRateAmount : c.client?.rateOfSaleAmount
      const rateTyp = frozen && c.saleRateType ? c.saleRateType : c.client?.rateType
      const rejection =
        c.status === CustomerStatus.DISAPPROVED       ? c.managerNote :
        c.status === CustomerStatus.FINAL_DISAPPROVED ? c.finalNote :
        c.status === CustomerStatus.AGENT_REJECTED    ? c.reason : ''
      lines.push(csvRow([
        c.customerCode, c.agent?.displayName, c.firstName, c.midName, c.lastName,
        c.age, fmtDateOnly(c.dateOfBirth), c.phone, c.address, c.city, c.state, c.postalCode,
        c.verticalType, c.verticalOther, c.didComments, c.transferredFrom, c.qaComments,
        c.reason, rejection, did, c.client?.saleType,
        ...(showCommercial ? [company, rate, rateTyp] : []),
        c.status.toLowerCase(), c.submittedAtPak, c.submittedAtEst, todayIn(BUSINESS_TZ, c.createdAt),
      ]))
    }
    return lines.join('\n')
  }
}
