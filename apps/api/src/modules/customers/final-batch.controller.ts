import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { FinalBatchService } from './final-batch.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

/** Final stage in bulk: approve from the client's sheet, reject a client's sales by date. Director and Admin. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DIRECTOR)
@Controller('final-batch')
export class FinalBatchController {
  constructor(private batch: FinalBatchService) {}

  @Post('preview')
  preview(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.batch.preview(actor, body) }

  @Post('approve')
  approve(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.batch.approve(actor, body) }

  @Get('pending')
  pending(@CurrentUser() actor: any, @Query() q: Record<string, string>) { return this.batch.pending(actor, q) }

  @Post('reject')
  reject(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.batch.reject(actor, body) }
}
