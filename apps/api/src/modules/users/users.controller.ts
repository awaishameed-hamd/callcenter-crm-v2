import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { UsersService }  from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard'
import { RolesGuard }    from '../../common/guards/roles.guard'
import { Roles }         from '../../common/decorators/roles.decorator'
import { CurrentUser }   from '../../common/decorators/current-user.decorator'
import { Role }          from '@crm/shared'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post()
  create(@Body() dto: CreateUserDto) { return this.users.create(dto) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Get()
  findAll(@Query('role') role?: Role) { return this.users.findAll(role) }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Get('agents')
  agentsDropdown() { return this.users.agentsDropdown() }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get('next-code')
  nextCode(@Query('role') role: Role) { return this.users.nextCode(role) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Get(':id')
  findOne(@Param('id') id: string) { return this.users.findOne(id) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) { return this.users.update(id, dto) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put(':id/activate')
  activate(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.users.activate(id, isActive)
  }

  @Roles(Role.ADMIN)
  @Put(':id/toggle-lock')
  toggleLock(@Param('id') id: string, @CurrentUser() user: any) {
    return this.users.toggleLock(id, user.role)
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.users.remove(id) }
}
