import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard'
import { RolesGuard }    from '../../common/guards/roles.guard'
import { Roles }         from '../../common/decorators/roles.decorator'
import { CurrentUser }   from '../../common/decorators/current-user.decorator'
import { LeavesService } from './leaves.service'
import { CreateLeaveDto } from './dto/create-leave.dto'
import { Role } from '@crm/shared'

@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeavesController {
  constructor(private readonly svc: LeavesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT)
  apply(@CurrentUser() user: any, @Body() dto: CreateLeaveDto) {
    return this.svc.apply(user.id, dto)
  }

  @Get('my')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT)
  getMyLeaves(@CurrentUser() user: any) {
    return this.svc.getMyLeaves(user.id)
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  getPending(@CurrentUser() user: any) {
    return this.svc.getPending(user)
  }

  @Get('all')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  getAll(@CurrentUser() user: any) {
    return this.svc.getAll(user)
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.approve(id, user)
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  reject(@Param('id') id: string, @CurrentUser() user: any, @Body('reason') reason?: string) {
    return this.svc.reject(id, user, reason)
  }
}
