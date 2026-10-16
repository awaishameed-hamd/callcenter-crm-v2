import { Injectable } from '@nestjs/common'
import { PrismaService }  from '../prisma/prisma.service'
import { CustomerStatus, Role, Vertical } from '@crm/shared'

export interface ReportFilters {
  from?:     string
  to?:       string
  status?:   CustomerStatus
  vertical?: Vertical
  agentId?:  string
  didId?:    string
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReport(requestingUser: { id: string; role: Role }, filters: ReportFilters) {
    const where: any = this.buildWhere(requestingUser, filters)

    return this.prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        agent:   { select: { displayName: true, userCode: true } },
        manager: { select: { displayName: true, userCode: true } },
        did: {
          select: {
            didCode: true, campaign: true,
            client: [Role.DIRECTOR, Role.ADMIN].includes(requestingUser.role)
              ? { select: { companyName: true } }
              : false,
          },
        },
      },
    })
  }

  async exportCsv(requestingUser: { id: string; role: Role }, filters: ReportFilters): Promise<string> {
    const rows = await this.getReport(requestingUser, filters)
    const showCompany = [Role.DIRECTOR, Role.ADMIN].includes(requestingUser.role)

    const headers = [
      'Customer Code', 'First Name', 'Last Name', 'DOB', 'State', 'Phone',
      'Vertical', 'DID', ...(showCompany ? ['Company'] : []),
      'Policy Number', 'Effective Date', 'Status', 'Agent', 'Manager', 'Submitted',
    ]

    const lines = [headers.join(',')]
    for (const r of rows) {
      const cols = [
        r.customerCode, r.firstName, r.lastName,
        r.dob ? r.dob.toISOString().slice(0,10) : '',
        r.state ?? '', r.phone ?? '',
        r.vertical, r.did.didCode,
        ...(showCompany ? [(r.did as any).client?.companyName ?? ''] : []),
        r.policyNumber ?? '',
        r.effectiveDate ? r.effectiveDate.toISOString().slice(0,10) : '',
        r.status,
        (r.agent as any)?.displayName ?? '',
        (r.manager as any)?.displayName ?? '',
        r.createdAt.toISOString().slice(0,10),
      ]
      lines.push(cols.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    return lines.join('\n')
  }

  private buildWhere(user: { id: string; role: Role }, f: ReportFilters) {
    const where: any = {}
    if (user.role === Role.AGENT) where.agentId = user.id
    if (f.from || f.to) {
      where.createdAt = {}
      if (f.from) where.createdAt.gte = new Date(f.from)
      if (f.to)   where.createdAt.lte = new Date(f.to + 'T23:59:59')
    }
    if (f.status)   where.status   = f.status
    if (f.vertical) where.vertical = f.vertical
    if (f.agentId && user.role !== Role.AGENT) where.agentId = f.agentId
    if (f.didId)    where.didId    = f.didId
    return where
  }
}
