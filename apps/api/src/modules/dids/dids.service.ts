import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class DidsService {
  constructor(private prisma: PrismaService) {}

  async createClient(companyName: string) {
    return this.prisma.client.create({ data: { companyName } })
  }

  findAllClients() {
    return this.prisma.client.findMany({
      include: { dids: true },
      orderBy: { companyName: 'asc' },
    })
  }

  async createDid(didCode: string, campaign: string, clientId: string) {
    const existing = await this.prisma.did.findUnique({ where: { didCode } })
    if (existing) throw new ConflictException('DID code already exists')
    return this.prisma.did.create({ data: { didCode, campaign, clientId } })
  }

  // Dropdown for sale form — filtered by vertical/campaign
  async dropdown(campaign?: string) {
    return this.prisma.did.findMany({
      where:  { isActive: true, ...(campaign ? { campaign } : {}) },
      select: { id: true, didCode: true, campaign: true, clientId: true },
      orderBy: { didCode: 'asc' },
    })
  }

  findAllDids() {
    return this.prisma.did.findMany({
      include: { client: true },
      orderBy: { didCode: 'asc' },
    })
  }

  async updateDid(id: string, data: Partial<{ didCode: string; campaign: string; clientId: string; isActive: boolean }>) {
    const did = await this.prisma.did.findUnique({ where: { id } })
    if (!did) throw new NotFoundException('DID not found')
    return this.prisma.did.update({ where: { id }, data })
  }
}
