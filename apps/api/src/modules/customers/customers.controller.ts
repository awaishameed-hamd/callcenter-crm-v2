import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { CustomersService } from './customers.service'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard'
import { RolesGuard }    from '../../common/guards/roles.guard'
import { Roles }         from '../../common/decorators/roles.decorator'
import { CurrentUser }   from '../../common/decorators/current-user.decorator'
import { Role }          from '@crm/shared'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Roles(Role.AGENT)
  @Post()
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: any) {
    return this.customers.create(dto, user.id)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.customers.findAll(user)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER, Role.AGENT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customers.findOne(id, user)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customers.approve(id, user.id)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR, Role.MANAGER)
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body('cancelReason') cancelReason: string,
    @CurrentUser() user: any,
  ) {
    return this.customers.reject(id, user.id, cancelReason)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/final-approve')
  finalApprove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customers.finalApprove(id, user.id)
  }

  @Roles(Role.ADMIN, Role.DIRECTOR)
  @Post(':id/final-reject')
  finalReject(
    @Param('id') id: string,
    @Body('cancelReason') cancelReason: string,
    @CurrentUser() user: any,
  ) {
    return this.customers.finalReject(id, user.id, cancelReason)
  }
}
