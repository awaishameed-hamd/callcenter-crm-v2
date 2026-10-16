import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { CustomersService } from './customers.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  findAll(@CurrentUser() actor: any, @Query() q: Record<string, string>) { return this.customers.findAll(actor, q) }

  @Roles(Role.AGENT)
  @Post()
  create(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.customers.create(actor, body) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Put(':id')
  update(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.customers.update(actor, id, body)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post(':id/approve')
  approve(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.customers.approve(actor, id, body)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post(':id/reject')
  reject(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.customers.reject(actor, id, body)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/final-approve')
  finalApprove(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.customers.finalApprove(actor, id, body)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/final-reject')
  finalReject(@CurrentUser() actor: any, @Param('id') id: string) { return this.customers.finalReject(actor, id) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.customers.remove(id) }
}
