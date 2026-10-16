import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { DimensionsService } from './dimensions.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('accounting/dimensions')
export class DimensionsController {
  constructor(private dims: DimensionsService) {}

  @Get('locations')              locations(@Query() q: Record<string, string>) { return this.dims.list('location', q) }
  @Post('locations')             createLocation(@Body() b: Record<string, any>) { return this.dims.create('location', b) }
  @Put('locations/:id')          updateLocation(@Param('id') id: string, @Body() b: Record<string, any>) { return this.dims.update('location', id, b) }
  @Patch('locations/:id/toggle') toggleLocation(@Param('id') id: string) { return this.dims.toggle('location', id) }
  @Delete('locations/:id')       deleteLocation(@Param('id') id: string) { return this.dims.remove('location', id) }

  @Get('cost-centres')              costCentres(@Query() q: Record<string, string>) { return this.dims.list('costCentre', q) }
  @Post('cost-centres')             createCostCentre(@Body() b: Record<string, any>) { return this.dims.create('costCentre', b) }
  @Put('cost-centres/:id')          updateCostCentre(@Param('id') id: string, @Body() b: Record<string, any>) { return this.dims.update('costCentre', id, b) }
  @Patch('cost-centres/:id/toggle') toggleCostCentre(@Param('id') id: string) { return this.dims.toggle('costCentre', id) }
  @Delete('cost-centres/:id')       deleteCostCentre(@Param('id') id: string) { return this.dims.remove('costCentre', id) }

  @Get('projects')              projects(@Query() q: Record<string, string>) { return this.dims.list('project', q) }
  @Post('projects')             createProject(@Body() b: Record<string, any>) { return this.dims.create('project', b) }
  @Put('projects/:id')          updateProject(@Param('id') id: string, @Body() b: Record<string, any>) { return this.dims.update('project', id, b) }
  @Patch('projects/:id/toggle') toggleProject(@Param('id') id: string) { return this.dims.toggle('project', id) }
  @Delete('projects/:id')       deleteProject(@Param('id') id: string) { return this.dims.remove('project', id) }
}
