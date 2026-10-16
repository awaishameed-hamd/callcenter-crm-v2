import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common'
import { DidsService }  from './dids.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { Role }         from '@crm/shared'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dids')
export class DidsController {
  constructor(private dids: DidsService) {}

  // Dropdown used by new-sale form
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT)
  @Get('dropdown')
  dropdown(@Query('campaign') campaign?: string) {
    return this.dids.dropdown(campaign)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get()
  findAll() { return this.dids.findAllDids() }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post()
  create(@Body() body: { didCode: string; campaign: string; clientId: string }) {
    return this.dids.createDid(body.didCode, body.campaign, body.clientId)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.dids.updateDid(id, body)
  }

  // Clients (companies that own DIDs)
  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get('clients')
  findAllClients() { return this.dids.findAllClients() }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post('clients')
  createClient(@Body('companyName') companyName: string) {
    return this.dids.createClient(companyName)
  }
}
