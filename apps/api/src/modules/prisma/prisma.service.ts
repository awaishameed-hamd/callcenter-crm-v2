import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { notifySalesChanged } from '../live/sales-events'

const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'])

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Any write to a sale, wherever it comes from, tells the live dashboards and reports to refetch
    this.$use(async (params, next) => {
      const result = await next(params)
      if (params.model === 'Customer' && WRITES.has(params.action)) notifySalesChanged()
      return result
    })
    await this.$connect()
  }
  async onModuleDestroy() { await this.$disconnect() }
}
