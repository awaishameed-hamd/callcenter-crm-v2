import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { V, fail } from '../../common/utils/validate'
import { dateOnly } from '../../common/utils/time'

const PROJECT_STATUSES = ['active', 'completed', 'on_hold', 'cancelled']
type Kind = 'location' | 'costCentre' | 'project'

@Injectable()
export class DimensionsService {
  constructor(private prisma: PrismaService) {}

  private delegate(kind: Kind): any {
    return kind === 'location' ? this.prisma.location : kind === 'costCentre' ? this.prisma.costCentre : this.prisma.project
  }

  private async assertCodeFree(kind: Kind, code: string, ignoreId?: string) {
    const hit = await this.delegate(kind).findUnique({ where: { code }, select: { id: true } })
    if (hit && hit.id !== ignoreId) fail('The code has already been taken.')
  }

  private async find(kind: Kind, id: string) {
    const row = await this.delegate(kind).findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Not found.')
    return row
  }

  list(kind: Kind, q: Record<string, string | undefined>) {
    const where: Record<string, unknown> = {}
    if (q.search) {
      const s = { contains: q.search, mode: 'insensitive' as const }
      const cols = kind === 'location' ? ['code', 'name', 'city'] : kind === 'project' ? ['code', 'name', 'clientName'] : ['code', 'name']
      where.OR = cols.map(c => ({ [c]: s }))
    }
    if (kind === 'project' && q.status) where.status = q.status
    if (V.bool(q.activeOnly)) where.isActive = true
    return this.delegate(kind).findMany({ where, orderBy: { code: 'asc' } })
  }

  private read(kind: Kind, b: Record<string, any>) {
    const base = {
      code: V.str(b.code, 'Code', { required: true, max: 20 })!,
      name: V.str(b.name, 'Name', { required: true, max: 255 })!,
    }
    if (kind === 'location') {
      return {
        ...base,
        address: V.str(b.address, 'Address', { max: 500 }) ?? null,
        city:    V.str(b.city, 'City', { max: 100 }) ?? null,
        country: V.str(b.country, 'Country', { max: 100 }) ?? null,
        notes:   V.str(b.notes, 'Notes') ?? null,
      }
    }
    if (kind === 'costCentre') return { ...base, description: V.str(b.description, 'Description') ?? null }
    const start = V.date(b.startDate, 'Start date') ?? null
    const end   = V.date(b.endDate, 'End date') ?? null
    if (start && end && end < start) fail('End date must be on or after the start date.')
    return {
      ...base,
      clientName:  V.str(b.clientName, 'Client name', { max: 255 }) ?? null,
      startDate:   start ? dateOnly(start) : null,
      endDate:     end ? dateOnly(end) : null,
      budget:      V.num(b.budget, 'Budget', { min: 0 }) ?? null,
      status:      V.oneOf(b.status, 'Status', PROJECT_STATUSES, { required: true })!,
      description: V.str(b.description, 'Description') ?? null,
    }
  }

  async create(kind: Kind, b: Record<string, any>) {
    const data = this.read(kind, b)
    await this.assertCodeFree(kind, data.code)
    return this.delegate(kind).create({ data: { ...data, isActive: true } })
  }

  async update(kind: Kind, id: string, b: Record<string, any>) {
    await this.find(kind, id)
    const data = this.read(kind, b)
    await this.assertCodeFree(kind, data.code, id)
    return this.delegate(kind).update({ where: { id }, data })
  }

  async toggle(kind: Kind, id: string) {
    const row = await this.find(kind, id)
    return this.delegate(kind).update({ where: { id }, data: { isActive: !row.isActive } })
  }

  async remove(kind: Kind, id: string) {
    await this.find(kind, id)
    const col = kind === 'location' ? 'locationId' : kind === 'costCentre' ? 'costCentreId' : 'projectId'
    const used = await this.prisma.voucherLine.count({ where: { [col]: id } })
    if (used > 0) fail(`Cannot delete: ${used} voucher line(s) reference it. Deactivate it instead.`)
    await this.delegate(kind).delete({ where: { id } })
    return { message: 'Deleted.' }
  }
}
