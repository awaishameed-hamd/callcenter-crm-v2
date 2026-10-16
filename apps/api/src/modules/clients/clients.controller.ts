import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { ClientsService } from './clients.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get('dropdown')
  dropdown(@Query('campaign') campaign?: string) { return this.clients.dropdown(campaign) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get('available-dids')
  availableDids(@Query('campaign') campaign?: string, @Query('currentDid') currentDid?: string) {
    return this.clients.availableDids(campaign, currentDid)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get()
  findAll(@Query() q: Record<string, string>) { return this.clients.findAll(q) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post()
  create(@Body() body: Record<string, any>) { return this.clients.create(body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.clients.update(id, body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: Record<string, any>) { return this.clients.update(id, body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/toggle-active')
  toggleActive(@Param('id') id: string) { return this.clients.toggleActive(id) }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dids')
export class DidsController {
  constructor(private clients: ClientsService) {}

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get()
  list() { return this.clients.listDids() }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post()
  create(@Body() body: Record<string, any>) { return this.clients.createDid(body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/toggle-active')
  toggle(@Param('id') id: string) { return this.clients.toggleDid(id) }
}
