import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { VerticalsService } from './verticals.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('verticals')
export class VerticalsController {
  constructor(private verticals: VerticalsService) {}

  /** Everyone signed in reads the list; usage counts are for the Admin/Director settings screen. */
  @Get()
  list(@CurrentUser() actor: { role: Role }, @Query('usage') usage?: string) {
    const canSeeUsage = actor.role === Role.ADMIN || actor.role === Role.DIRECTOR
    return this.verticals.list(canSeeUsage && usage === '1')
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post()
  create(@Body() body: Record<string, any>) { return this.verticals.create(body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put('order')
  reorder(@Body('ids') ids: unknown) { return this.verticals.reorder(ids) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) { return this.verticals.update(id, body) }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Delete(':id')
  remove(@Param('id') id: string) { return this.verticals.remove(id) }
}
