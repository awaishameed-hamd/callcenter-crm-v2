import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { SALE_TYPES, RATE_TYPES } from '@crm/shared'
import { PrismaService } from '../prisma/prisma.service'
import { VerticalsService } from '../verticals/verticals.service'
import { InvoicesService } from '../invoices/invoices.service'
import { V, fail, defined, pageArgs, toPage } from '../../common/utils/validate'

const didNumber = (code: string | null) => parseInt((code ?? '').slice(2), 10) || 0

/**
 * A line's full label, shown wherever lines are listed (reports, approvals, dashboard, batch
 * import): the client's name and the line's name, "Centerfield Inbound". A line named like its
 * client (or already starting with the client's name) shows just that name.
 */
export function lineLabel(client: string, line: string) {
  const c = client.trim(), l = line.trim()
  if (!l || l.toLowerCase() === c.toLowerCase() || l.toLowerCase().startsWith(`${c.toLowerCase()} `)) return l || c
  return `${c} ${l}`
}

// Clients and their lines (user, 2026-11-16). A line (the `clients` table, the old "client") is
// what a DID is connected to, and keeps everything the client had before: rate, billing cycle,
// opening balance, its own invoices; sales, reports and approvals work line by line. A client
// (Company) groups 3 or 4 lines into one ledger, where its payments are recorded.
@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService, private verticals: VerticalsService, private invoices: InvoicesService) {}

  /** NewSale dropdown: active lines with a DID. Never exposes the company name. */
  async dropdown(campaign?: string) {
    const rows = await this.prisma.client.findMany({
      where:  { isActive: true, didCode: { not: null }, ...(campaign ? { campaign } : {}) },
      select: { id: true, didCode: true, campaign: true, saleType: true },
    })
    return rows.sort((a, b) => (a.campaign ?? '').localeCompare(b.campaign ?? '') || didNumber(a.didCode) - didNumber(b.didCode))
  }

  /** DIDs from the pool that are not assigned to an active line. */
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

  // ── Lines ───────────────────────────────────────────────────────────────────

  /** Lines, each with its client's id and name (for report filters, pickers and the Clients page). */
  async findAll(q: Record<string, string | undefined>) {
    const where: Prisma.ClientWhereInput = {}
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      where.OR = [{ companyName: s }, { lineName: s }, { didCode: s }, { company: { name: s } }]
    }
    if (q.campaign) where.campaign = q.campaign
    if (q.status) where.isActive = q.status === 'active'
    if (q.companyId) where.companyId = q.companyId
    const perPage = q.perPage === 'all' ? undefined : 15
    const orderBy: Prisma.ClientOrderByWithRelationInput[] = [{ campaign: 'asc' }, { companyName: 'asc' }]
    const include = { company: { select: { id: true, name: true } } }
    if (!perPage) return this.prisma.client.findMany({ where, orderBy, include })
    const { skip, take, page } = pageArgs(q.page, perPage)
    const [data, total] = await Promise.all([
      this.prisma.client.findMany({ where, orderBy, include, skip, take }),
      this.prisma.client.count({ where }),
    ])
    return toPage(data, total, page, perPage)
  }

  private readLine(b: Record<string, any>, creating: boolean) {
    const rateType = V.oneOf(b.rateType, 'Rate type', RATE_TYPES, { required: creating })
    const rate = V.num(b.rateOfSaleAmount, 'Rate per sale', { min: 0 })
    if (creating && rateType === 'fixed' && (rate === null || rate === undefined)) fail('Rate per sale is required when the rate type is fixed.')
    const extra = V.obj(b.extraFields, 'Extra fields')
    return defined({
      lineName:         V.str(b.lineName, 'Line name', { max: 120 }) ?? undefined,
      campaign:         V.str(b.campaign, 'Campaign', { required: creating, max: 50 }) ?? undefined, // checked against the verticals in create/update
      didCode:          V.str(b.didCode, 'DID', { max: 10 }),
      saleType:         V.oneOf(b.saleType, 'Sale type', SALE_TYPES, { required: creating }),
      rateType:         rateType ?? undefined,
      rateOfSaleAmount: rate,
      // Each line keeps its opening balance and is invoiced on its own cycle, as before clients had lines
      openingBalance:        V.num(b.openingBalance, 'Opening balance', { min: 0 }),
      cycleOfDay:            V.int(b.cycleOfDay, 'Cycle (days)', { required: creating, min: 1 }),
      billingStartAfterDays: V.int(b.billingStartAfterDays, 'Billing starts after (days)', { required: creating, min: 0 }),
      notes:            V.str(b.notes, 'Notes'),
      extraFields:      extra === null ? Prisma.DbNull : (extra as Prisma.InputJsonValue | undefined),
    })
  }

  private async assertDidFree(didCode: string | null | undefined, ignoreId?: string) {
    if (!didCode) return
    const taken = await this.prisma.client.findFirst({
      where: { isActive: true, didCode, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    })
    if (taken) fail('This DID is already assigned to another active line.')
  }

  private async assertLineNameFree(companyId: string, lineName: string, ignoreId?: string) {
    const clash = await this.prisma.client.findFirst({
      where: { companyId, lineName: { equals: lineName.trim(), mode: 'insensitive' }, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    })
    if (clash) fail('This client already has a line with that name.')
  }

  /**
   * New line under a client (`companyId`). Without one, a client named `companyName` is created
   * for it first (with the opening balance sent), and the line takes the client's name.
   */
  async create(b: Record<string, any>) {
    const data = this.readLine(b, true)
    await this.verticals.assertCampaign(data.campaign as string | undefined)
    await this.assertDidFree(data.didCode as string | null | undefined)

    let companyId = V.str(b.companyId, 'Client')
    let company: { id: string; name: string } | null
    if (companyId) {
      company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } })
      if (!company) fail('Pick the client this line belongs to.')
    } else {
      if (!V.str(b.companyName, 'Client name')) fail('Pick the client this line belongs to.')
      company = (await this.createCompany({ companyName: b.companyName })).company
      companyId = company.id
    }
    const lineName = ((data.lineName as string | undefined) ?? company!.name).trim()
    await this.assertLineNameFree(companyId!, lineName)
    const client = await this.prisma.client.create({
      data: {
        ...(data as Omit<Prisma.ClientUncheckedCreateInput, 'companyId' | 'lineName' | 'companyName'>),
        companyId: companyId!, lineName,
        companyName: lineLabel(company!.name, lineName), displayName: lineLabel(company!.name, lineName),
      },
      include: { company: { select: { id: true, name: true } } },
    })
    if (client.openingBalance && Number(client.openingBalance) > 0) await this.invoices.syncOpeningInvoice(client.id, Number(client.openingBalance))
    return { client }
  }

  /**
   * Edits a line; renaming it or moving it to another client updates its label. A moved line takes
   * its invoices to the new client's ledger, so it cannot move once a payment is recorded on them.
   */
  async update(id: string, b: Record<string, any>) {
    const line = await this.prisma.client.findUnique({ where: { id }, include: { company: { select: { id: true, name: true } } } })
    if (!line) throw new NotFoundException('Line not found.')
    const data = this.readLine(b, false)
    if (data.campaign !== undefined && data.campaign !== line.campaign) await this.verticals.assertCampaign(data.campaign as string)
    if (data.didCode !== undefined && data.didCode !== line.didCode) await this.assertDidFree(data.didCode as string | null, id)

    let company = line.company
    const movedTo = V.str(b.companyId, 'Client')
    const moving = !!movedTo && movedTo !== line.companyId
    if (moving) {
      const target = await this.prisma.company.findUnique({ where: { id: movedTo! }, select: { id: true, name: true } })
      if (!target) fail('Pick the client this line belongs to.')
      if (await this.prisma.paymentAllocation.count({ where: { invoice: { clientId: id } } })) {
        fail('Payments are recorded on this line\'s invoices, so it stays with its client.')
      }
      company = target!
    }
    const lineName = ((data.lineName as string | undefined) ?? line.lineName).trim()
    if (moving || lineName.toLowerCase() !== line.lineName.toLowerCase()) await this.assertLineNameFree(company.id, lineName, id)
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.client.update({
        where: { id },
        data: { ...(data as Prisma.ClientUncheckedUpdateInput), companyId: company.id, lineName, companyName: lineLabel(company.name, lineName) },
        include: { company: { select: { id: true, name: true } } },
      })
      if (moving) await tx.invoice.updateMany({ where: { clientId: id }, data: { companyId: company.id } })
      return u
    })
    // The ledger reads the opening balance as an OPENING invoice; keep it in step with the form
    if (data.openingBalance !== undefined && Number(updated.openingBalance ?? 0) !== Number(line.openingBalance ?? 0)) {
      await this.invoices.syncOpeningInvoice(id, Number(updated.openingBalance ?? 0))
    }
    return { client: updated }
  }

  async toggleActive(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } })
    if (!client) throw new NotFoundException('Line not found.')
    if (!client.isActive) await this.assertDidFree(client.didCode, id)
    const updated = await this.prisma.client.update({ where: { id }, data: { isActive: !client.isActive } })
    return { isActive: updated.isActive }
  }

  // ── Clients (the companies that own the lines) ─────────────────────────────

  /** Every client with its lines, for the Clients page and the billing pickers. */
  async companies() {
    const rows = await this.prisma.company.findMany({
      include: { lines: { orderBy: [{ createdAt: 'asc' }] } },
      orderBy: { name: 'asc' },
    })
    return rows.map(c => ({ ...c, isActive: c.isActive && (!c.lines.length || c.lines.some(l => l.isActive)) }))
  }

  private readCompany(b: Record<string, any>, creating: boolean) {
    return defined({
      name:  V.str(b.name ?? b.companyName, 'Client name', { required: creating, max: 255 }) ?? undefined,
      notes: V.str(b.notes, 'Notes'),
    })
  }

  private async assertCompanyNameFree(name: string, ignoreId?: string) {
    const clash = await this.prisma.company.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' }, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    })
    if (clash) throw new ConflictException('A client with this name already exists.')
  }

  async createCompany(b: Record<string, any>) {
    const data = this.readCompany(b, true)
    const name = (data.name as string).trim()
    await this.assertCompanyNameFree(name)
    const company = await this.prisma.company.create({ data: { ...(data as Prisma.CompanyCreateInput), name } })
    return { company }
  }

  /** Edits a client; a new name relabels its lines. */
  async updateCompany(id: string, b: Record<string, any>) {
    const company = await this.prisma.company.findUnique({ where: { id }, include: { lines: { select: { id: true, lineName: true } } } })
    if (!company) throw new NotFoundException('Client not found.')
    const data = this.readCompany(b, false)
    const name = data.name !== undefined ? (data.name as string).trim() : company.name
    if (name.toLowerCase() !== company.name.toLowerCase()) await this.assertCompanyNameFree(name, id)
    const updated = await this.prisma.$transaction(async tx => {
      const u = await tx.company.update({ where: { id }, data: { ...(data as Prisma.CompanyUpdateInput), name } })
      if (name !== company.name) {
        for (const l of company.lines) await tx.client.update({ where: { id: l.id }, data: { companyName: lineLabel(name, l.lineName) } })
      }
      return u
    })
    return { company: updated }
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
