import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common'
import { PrismaService }    from '../prisma/prisma.service'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { CustomerStatus, Role } from '@crm/shared'

const CANCEL_REASONS = ['XFER','No LA','Ringing','Over Age','Out of State','Hangup','No medicare card']

// Format a Date in a given IANA timezone with label suffix
function fmtTz(date: Date, tz: string, label: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date).replace(',', '') + ` ${label}`
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCustomerDto, agentId: string) {
    // Generate customer code after insert
    const counter = await this.prisma.sequenceCounter.upsert({
      where:  { key: 'customerCode' },
      update: { value: { increment: 1 } },
      create: { key: 'customerCode', value: 1 },
    })
    const customerCode = `C-${String(counter.value).padStart(7, '0')}`

    const now = new Date()
    return this.prisma.customer.create({
      data: {
        customerCode,
        firstName:     dto.firstName,
        lastName:      dto.lastName,
        dob:           dto.dob       ? new Date(dto.dob)           : undefined,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
        state:         dto.state,
        phone:         dto.phone,
        address:       dto.address,
        vertical:      dto.vertical,
        didId:         dto.didId,
        policyNumber:  dto.policyNumber,
        notes:         dto.notes,
        agentId,
        // Freeze both timezone timestamps at submission — never changes
        submittedAtPkt: fmtTz(now, 'Asia/Karachi',      'PKT'),
        submittedAtEst: fmtTz(now, 'America/New_York',  'EST'),
      },
      include: this.baseInclude(Role.AGENT),
    })
  }

  async findAll(requestingUser: { id: string; role: Role }) {
    const where =
      requestingUser.role === Role.AGENT
        ? { agentId: requestingUser.id }
        : {}

    return this.prisma.customer.findMany({
      where,
      include: this.baseInclude(requestingUser.role),
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string, requestingUser: { id: string; role: Role }) {
    const customer = await this.prisma.customer.findUnique({
      where:   { id },
      include: this.baseInclude(requestingUser.role),
    })
    if (!customer) throw new NotFoundException('Customer not found')
    if (requestingUser.role === Role.AGENT && customer.agentId !== requestingUser.id) {
      throw new ForbiddenException()
    }
    return customer
  }

  async approve(id: string, managerId: string) {
    const c = await this.requireStatus(id, CustomerStatus.PENDING)
    return this.prisma.customer.update({
      where: { id },
      data:  { status: CustomerStatus.APPROVED, managerId, approvedAt: new Date() },
      include: this.baseInclude(Role.MANAGER),
    })
  }

  async reject(id: string, managerId: string, cancelReason: string) {
    this.validateCancelReason(cancelReason)
    await this.requireStatus(id, CustomerStatus.PENDING)
    return this.prisma.customer.update({
      where: { id },
      data:  { status: CustomerStatus.DISAPPROVED, managerId, cancelReason },
      include: this.baseInclude(Role.MANAGER),
    })
  }

  async finalApprove(id: string, directorId: string) {
    await this.requireStatus(id, CustomerStatus.APPROVED)
    const snapshot = await this.getDidSnapshot(id)
    return this.prisma.customer.update({
      where: { id },
      data:  { status: CustomerStatus.FINAL_APPROVED, directorId, finalActedAt: new Date(), ...snapshot },
      include: this.baseInclude(Role.DIRECTOR),
    })
  }

  async finalReject(id: string, directorId: string, cancelReason: string) {
    this.validateCancelReason(cancelReason)
    await this.requireStatus(id, CustomerStatus.APPROVED)
    const snapshot = await this.getDidSnapshot(id)
    return this.prisma.customer.update({
      where: { id },
      data:  { status: CustomerStatus.FINAL_DISAPPROVED, directorId, cancelReason, finalActedAt: new Date(), ...snapshot },
      include: this.baseInclude(Role.DIRECTOR),
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async requireStatus(id: string, expected: CustomerStatus) {
    const c = await this.prisma.customer.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('Customer not found')
    if (c.status !== expected) throw new BadRequestException(`Customer is not in ${expected} status`)
    return c
  }

  private async getDidSnapshot(customerId: string) {
    const c = await this.prisma.customer.findUnique({
      where:   { id: customerId },
      include: { did: { include: { client: true } } },
    })
    return {
      saleDid:         c?.did?.didCode        ?? null,
      saleCompanyName: c?.did?.client?.companyName ?? null,
    }
  }

  private validateCancelReason(reason: string) {
    if (!CANCEL_REASONS.includes(reason)) {
      throw new BadRequestException(`Invalid cancel reason. Must be one of: ${CANCEL_REASONS.join(', ')}`)
    }
  }

  private baseInclude(role: Role) {
    const showCompany = role !== Role.AGENT && role !== Role.MANAGER
    return {
      agent:   { select: { id: true, displayName: true, userCode: true } },
      manager: { select: { id: true, displayName: true, userCode: true } },
      did: {
        select: {
          id: true, didCode: true, campaign: true,
          client: showCompany
            ? { select: { id: true, companyName: true } }
            : false,
        },
      },
    }
  }
}
