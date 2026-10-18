import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'

/** At most 10 verticals, "Other" included. */
export const MAX_VERTICALS = 10
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * The one list of verticals (Medicare, Final Expense, ...). Sales store the vertical's name in
 * verticalType, clients and DIDs in campaign, so renaming a vertical updates those rows too.
 * "Other" is the free-text choice: it always exists, needs no DID and is never a campaign.
 */
@Injectable()
export class VerticalsService {
  constructor(private prisma: PrismaService) {}

  /** Every vertical in display order; with usage, how many sales, clients and DIDs use each one. */
  async list(withUsage = false) {
    const rows = await this.prisma.vertical.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    if (!withUsage) return rows
    const [sales, clients, dids] = await Promise.all([
      this.prisma.customer.groupBy({ by: ['verticalType'], _count: { _all: true } }),
      this.prisma.client.groupBy({ by: ['campaign'], _count: { _all: true } }),
      this.prisma.did.groupBy({ by: ['campaign'], _count: { _all: true } }),
    ])
    const count = (list: { _count: { _all: number } }[], key: string, name: string) =>
      (list as any[]).find(r => r[key] === name)?._count._all ?? 0
    return rows.map(v => ({
      ...v,
      usage: { sales: count(sales, 'verticalType', v.name), clients: count(clients, 'campaign', v.name), dids: count(dids, 'campaign', v.name) },
    }))
  }

  /** Looks a vertical up by name (null when it does not exist). */
  find(name: string) {
    return this.prisma.vertical.findUnique({ where: { name } })
  }

  /** A campaign for a client or DID: an active vertical other than "Other". */
  async assertCampaign(name: string | null | undefined, label = 'Campaign') {
    if (!name) return
    const v = await this.prisma.vertical.findUnique({ where: { name } })
    if (!v || !v.isActive || v.isOther) fail(`${label} must be one of the active verticals.`)
  }

  /** Active vertical names, for the sale form's Vertical Type field and the client form's Campaign field. */
  async optionsFor(fieldKey: 'vertical_type' | 'campaign') {
    const rows = await this.prisma.vertical.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
    return rows.filter(v => fieldKey === 'vertical_type' || !v.isOther).map(v => v.name)
  }

  async create(b: Record<string, any>) {
    if (await this.prisma.vertical.count() >= MAX_VERTICALS) fail(`You can have at most ${MAX_VERTICALS} verticals, "Other" included.`)
    const name  = await this.uniqueName(V.str(b.name, 'Name', { required: true, max: 40 })!)
    const color = this.color(b.color, true)!
    const last  = await this.prisma.vertical.findFirst({ where: { isOther: false }, orderBy: { sortOrder: 'desc' } })
    return this.prisma.vertical.create({ data: { name, color, sortOrder: (last?.sortOrder ?? 0) + 1 } })
  }

  async update(id: string, b: Record<string, any>) {
    const v = await this.load(id)
    const color = this.color(b.color)
    const isActive = V.bool(b.isActive)
    let name = V.str(b.name, 'Name', { max: 40 }) ?? undefined
    if (v.isOther && name && name !== v.name) fail('"Other" cannot be renamed.')
    if (v.isOther && isActive === false) fail('"Other" cannot be turned off.')
    if (name && name !== v.name) name = await this.uniqueName(name, v.id)

    return this.prisma.$transaction(async tx => {
      if (name && name !== v.name) {
        // Sales, clients and DIDs store the name, so they move with it
        await tx.customer.updateMany({ where: { verticalType: v.name }, data: { verticalType: name } })
        await tx.client.updateMany({ where: { campaign: v.name }, data: { campaign: name } })
        await tx.did.updateMany({ where: { campaign: v.name }, data: { campaign: name } })
      }
      return tx.vertical.update({
        where: { id },
        data: { ...(name ? { name } : {}), ...(color ? { color } : {}), ...(isActive === undefined || isActive === null ? {} : { isActive }) },
      })
    })
  }

  /** New display order; "Other" always stays last. */
  async reorder(ids: unknown) {
    if (!Array.isArray(ids)) fail('Order must be a list of vertical ids.')
    const rows = await this.prisma.vertical.findMany({ where: { isOther: false }, select: { id: true } })
    const known = new Set(rows.map(r => r.id))
    const ordered = (ids as unknown[]).map(String).filter(id => known.has(id))
    await this.prisma.$transaction(ordered.map((id, i) => this.prisma.vertical.update({ where: { id }, data: { sortOrder: i + 1 } })))
    return this.list(true)
  }

  /** Only a vertical nothing uses can be deleted; otherwise turn it off. */
  async remove(id: string) {
    const v = await this.load(id)
    if (v.isOther) fail('"Other" cannot be deleted.')
    const [sales, clients, dids] = await Promise.all([
      this.prisma.customer.count({ where: { verticalType: v.name } }),
      this.prisma.client.count({ where: { campaign: v.name } }),
      this.prisma.did.count({ where: { campaign: v.name } }),
    ])
    if (sales || clients || dids) fail(`${v.name} is used by ${sales} sales, ${clients} clients and ${dids} DIDs. Turn it off instead of deleting it.`)
    await this.prisma.vertical.delete({ where: { id } })
    return { message: `${v.name} deleted.` }
  }

  private async load(id: string) {
    const v = await this.prisma.vertical.findUnique({ where: { id } })
    if (!v) throw new NotFoundException('Vertical not found.')
    return v
  }

  private async uniqueName(name: string, exceptId?: string) {
    const clash = await this.prisma.vertical.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } })
    if (clash) fail(`A vertical named "${clash.name}" already exists.`)
    return name
  }

  private color(v: unknown, required = false) {
    const c = V.str(v, 'Colour', { required })
    if (c && !HEX.test(c)) fail('Colour must be a hex value like #1E8496.')
    return c ?? undefined
  }
}
