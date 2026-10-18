import { Global, Module } from '@nestjs/common'
import { VerticalsController } from './verticals.controller'
import { VerticalsService } from './verticals.service'

// Global: sales, clients, DIDs and the form builder all validate against the vertical list
@Global()
@Module({
  controllers: [VerticalsController],
  providers:   [VerticalsService],
  exports:     [VerticalsService],
})
export class VerticalsModule {}
