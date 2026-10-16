import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Role } from '@crm/shared'
import { CrmService } from './crm.service'
import { UsersService } from '../users/users.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard }   from '../../common/guards/roles.guard'
import { Roles }        from '../../common/decorators/roles.decorator'
import { CurrentUser }  from '../../common/decorators/current-user.decorator'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private crm: CrmService, private users: UsersService) {}

  @Get('form-fields/public')
  publicFields(@Query('formType') formType?: string) { return this.crm.publicFields(formType) }

  @Roles(Role.ADMIN)
  @Get('form-fields')
  fields(@Query('formType') formType?: string) { return this.crm.fields(formType) }

  @Roles(Role.ADMIN)
  @Put('form-fields')
  update(@Body('formType') formType: string, @Body('fields') fields: unknown) { return this.crm.updateFields(formType, fields) }

  @Roles(Role.ADMIN)
  @Post('form-fields')
  create(@Body() body: Record<string, any>) { return this.crm.createField(body.formType, body) }

  @Roles(Role.ADMIN)
  @Delete('form-fields/:formType/:fieldKey')
  remove(@Param('formType') formType: string, @Param('fieldKey') fieldKey: string) { return this.crm.deleteField(formType, fieldKey) }

  @Roles(Role.ADMIN)
  @Put('users/:id/role')
  updateRole(@CurrentUser() actor: any, @Param('id') id: string, @Body('role') role: string) {
    return this.users.updateRole(actor, id, role)
  }
}
