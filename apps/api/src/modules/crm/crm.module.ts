import { Module } from '@nestjs/common'
import { CrmController } from './crm.controller'
import { CrmService } from './crm.service'
import { UsersModule } from '../users/users.module'

@Module({
  imports:     [UsersModule],
  controllers: [CrmController],
  providers:   [CrmService],
})
export class CrmModule {}
