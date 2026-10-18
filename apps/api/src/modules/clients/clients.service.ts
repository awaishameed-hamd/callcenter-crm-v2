import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { SALE_TYPES, RATE_TYPES } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { VerticalsService } from '../verticals/verticals.service'
import { V, fail, defined, pageArgs, toPage } from '../../common/utils/validate'

const didNumber = (code: string | null) => parseInt((code ?? '').slice(2), 10) || 0

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService, private verticals: VerticalsService) {}

  /** NewSale dropdown: active clients with a DID. Never exposes the company name. */
  async dropdown(campaign?: string) {
    const rows = await this.prisma.client.findMany({
      where:  { isActive: true, didCode: { not: null }, ...(campaign ? { campaign } : {}) },
      select: { id: true, didCode: true, campaign: true, saleType: true },
    })
    return rows.sort((a, b) => (a.campaign ?? '').localeCompare(b.campaign ?? '') || didNumber(a.didCode) - didNumber(b.didCode))
  }

  /** DIDs from the pool that are not assigned to an active client. */
  async availableDids(campaign?: string, currentDid?: string) {
    const assigned = await this.prisma.client.findMany({
      where: { isActive: true, didCode: { not: null } },
      select: { didCode: true },
    })
    const taken = new Set(assigned.map(c => c.didCode))
    const dids = await this.prisma.did.findMany({ where: { isActive: true }, select: { id: true, didCode: true, campaign: true } })
    return dids
      .filter(d => (d.didCode === currentDid) || (!taken.has(d.didCode) && (!campaign || d.campaign === campaign)))
      .sort((a, b) => didNumber(a.didCode) - didNumber(b.didCode))
  }

  async findAll(q: Record<string, string | undefined>) {
    const where: Prisma.ClientWhereInput = {}
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ companyName: s }, { didCode: s }]
    }
    if (q.campaign) where.campaign = q.campaign
    if (q.status) where.isActive = q.status === 'active'
    const perPage = q.perPage === 'all' ? undefined : 15
    const orderBy: Prisma.ClientOrderByWithRelationInput[] = [{ campaign: 'asc' }, { companyName: 'asc' }]
    if (!perPage) return this.prisma.client.findMany({ where, orderBy })
    const { skip, take, page } = pageArgs(q.page, perPage)
    const [data, total] = await Promise.all([
      this.prisma.client.findMany({ where, orderBy, skip, take }),
      this.prisma.client.count({ where }),
    ])
    return toPage(data, total, page, perPage)
  }

  private read(b: Record<string, any>, creating: boolean) {
    const rateType = V.oneOf(b.rateType, 'Rate type', RATE_TYPES, { required: creating })
    const rate = V.num(b.rateOfSaleAmount, 'Rate per sale', { min: 0 })
    if (creating && rateType === 'fixed' && (rate === null || rate === undefined)) fail('Rate per sale is required when the rate type is fixed.')
    const extra = V.obj(b.extraFields, 'Extra fields')
    return defined({
      companyName:           V.str(b.companyName, 'Company name', { required: creating, max: 255 }) ?? undefined,
      campaign:              V.str(b.campaign, 'Campaign', { required: creating, max: 50 }) ?? undefined, // checked against the verticals in create/update
      didCode:               V.str(b.didCode, 'DID', { max: 10 }),
      saleType:              V.oneOf(b.saleType, 'Sale type', SALE_TYPES, { required: creating }),
      rateType:              rateType ?? undefined,
      rateOfSaleAmount:      rate,
      openingBalance:        V.num(b.openingBalance, 'Opening balance', { min: 0 }),
      cycleOfDay:            V.int(b.cycleOfDay, 'Cycle (days)', { required: true, min: 1 }),
      billingStartAfterDays: V.int(b.billingStartAfterDays, 'Billing starts after (days)', { required: true, min: 0 }),
      notes:                 V.str(b.notes, 'Notes'),
      extraFields:           extra === null ? Prisma.DbNull : (extra as Prisma.InputJsonValue | undefined),
    })
  }

  private async assertDidFree(didCode: string | null | undefined, ignoreId?: string) {
    if (!didCode) return
    const taken = await this.prisma.client.findFirst({
      where: { isActive: true, didCode, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    })
    if (taken) fail('This DID is already assigned to another active client.')
  }

  async create(b: Record<string, any>) {
    const data = this.read(b, true)
    await this.verticals.assertCampaign(data.campaign as string | undefined)
    await this.assertDidFree(data.didCode as string | null | undefined)
    const client = await this.prisma.client.create({
      data: { ...(data as Prisma.ClientCreateInput), displayName: data.companyName as string },
    })
    return { client }
  }

  async update(id: string, b: Record<string, any>) {
    const client = await this.prisma.client.findUnique({ where: { id } })
    if (!client) throw new NotFoundException('Client not found.')
    const data = this.read(b, false)
    if (data.campaign !== undefined && data.campaign !== client.campaign) await this.verticals.assertCampaign(data.campaign as string)
    if (data.didCode !== undefined && data.didCode !== client.didCode) await this.assertDidFree(data.didCode as string | null, id)
    const updated = await this.prisma.client.update({ where: { id }, data: data as Prisma.ClientUpdateInput })
    return { client: updated }
  }

  async toggleActive(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } })
    if (!client) throw new NotFoundException('Client not found.')
    if (!client.isActive) await this.assertDidFree(client.didCode, id)
    const updated = await this.prisma.client.update({ where: { id }, data: { isActive: !client.isActive } })
    return { isActive: updated.isActive }
  }

  // ── DID pool ────────────────────────────────────────────────────────────────

  async listDids() {
    const [dids, assigned] = await Promise.all([
      this.prisma.did.findMany(),
      this.prisma.client.findMany({ where: { isActive: true, didCode: { not: null } }, select: { didCode: true, companyName: true } }),
    ])
    const owner = new Map(assigned.map(c => [c.didCode, c.companyName]))
    return dids
      .map(d => ({ ...d, assignedTo: owner.get(d.didCode) ?? null }))
      .sort((a, b) => a.campaign.localeCompare(b.campaign) || didNumber(a.didCode) - didNumber(b.didCode))
  }

  async createDid(b: Record<string, any>) {
    const didCode  = V.str(b.didCode, 'DID code', { required: true, max: 10 })!.toUpperCase()
    const campaign = V.str(b.campaign, 'Campaign', { required: true, max: 50 })!
    await this.verticals.assertCampaign(campaign)
    if (await this.prisma.did.findUnique({ where: { didCode } })) throw new ConflictException('DID code already exists.')
    return this.prisma.did.create({ data: { didCode, campaign } })
  }

  async toggleDid(id: string) {
    const did = await this.prisma.did.findUnique({ where: { id } })
    if (!did) throw new NotFoundException('DID not found.')
    return this.prisma.did.update({ where: { id }, data: { isActive: !did.isActive } })
  }
}
