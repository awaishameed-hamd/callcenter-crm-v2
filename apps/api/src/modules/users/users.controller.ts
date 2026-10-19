import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Get('next-code')
  nextCode(@Query('role') role: string) { return this.users.nextCode(role) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Get('agents')
  agentsDropdown() { return this.users.agentsDropdown() }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Get()
  findAll(@CurrentUser() actor: any, @Query() q: Record<string, string>) { return this.users.findAll(actor, q) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post()
  create(@CurrentUser() actor: any, @Body() body: Record<string, any>) { return this.users.create(actor, body) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Put(':id')
  update(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.users.update(actor, id, body)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Patch(':id')
  patch(@CurrentUser() actor: any, @Param('id') id: string, @Body() body: Record<string, any>) {
    return this.users.update(actor, id, body)
  }

  // Permanent delete; the service enforces who may delete whom and refuses users with sales
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Delete(':id/permanent')
  deletePermanently(@CurrentUser() actor: any, @Param('id') id: string) { return this.users.deletePermanently(actor, id) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Delete(':id')
  deactivate(@CurrentUser() actor: any, @Param('id') id: string, @Body('inactiveSince') inactiveSince: string) {
    return this.users.deactivate(actor, id, inactiveSince)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post(':id/activate')
  activate(@CurrentUser() actor: any, @Param('id') id: string) { return this.users.activate(actor, id) }

  @Roles(Role.ADMIN)
  @Post(':id/toggle-lock')
  toggleLock(@CurrentUser() actor: any, @Param('id') id: string) { return this.users.toggleLock(actor, id) }
}
